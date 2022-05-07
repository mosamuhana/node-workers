import { cpus } from "os";
import { AsyncResource } from "async_hooks";
import { EventEmitter } from "events";
import { Worker, MessageChannel, isMainThread, MessagePort, parentPort, workerData } from "worker_threads";
import { extname } from "path";
import { Mutex } from "./mutex";

const CPUS = cpus().length;
const TERMINATE_PROMISE_SUPPORT = (() => {
	const [ major, minor ] = process.version.replace("v", "").split(".").map((x) => parseInt(x, 10));
	return major >= 12 && minor >= 5;
})();

const CLOSED_ERROR = new Error("WorkerPool is closed");

type Callback<T = any> = (error?: any, result?: T) => void
type CustomWorker = Worker & { taskInfo?: TaskInfo, port: MessagePort };

export interface Options {
	workerFile?: string;
	workerScript?: string;
	maxWorkers?: number;
	timeout?: number;
}

export class WorkerError extends Error {
	constructor(public error: Error, public task: any) {
		super((error?.message || error || "Unknown error").toString());
		this.name = "WorkerError";
		this.stack = error?.stack;
	}
	[Symbol.toStringTag]() { return "WorkerError"; }
}

export interface Results<T> {
	results: T[];
	errors: WorkerError[];
}

class TaskInfo<T = unknown, R = unknown> extends AsyncResource {
	constructor(private callback: Callback, private task: T) {
		super("TaskInfo");
	}

	done(error?: any, _result?: PromiseSettledResult<R>) {
		let result: R | undefined;
		if (error) {
			error = new WorkerError(error, this.task);
		} else {
			const res = _result as PromiseSettledResult<R>;
			if (res.status === 'fulfilled') {
				result = res.value;
			} else if (res.status === 'rejected') {
				error = new WorkerError(res.reason, this.task);
			}
		}
		this.runInAsyncScope(this.callback, null, error, result);
		this.emitDestroy();
	}
}

export class WorkerPool extends EventEmitter {
	#scriptFile: string;
	#eval = false;
	#maxWorkers: number;
	#workers: CustomWorker[] = [];
	#freeWorkers: CustomWorker[] = [];
	#tasks: { task: any; callback: any }[] = [];
	#eventMutex = new Mutex();
	#mutex = new Mutex();
	#closed = false;
	#timeout: number = -1;

	get maxWorkers() { return this.#maxWorkers; }

	constructor(options: Options) {
		super();

		if (!isMainThread) {
			//throw new Error('WorkerPool can only be created in main thread');
		}

		const maxWorkers = options.maxWorkers;
		if (maxWorkers == null) {
			this.#maxWorkers = CPUS * 2;
		} else {
			if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
				throw new Error('maxWorkers must be a positive integer >= 1');
			}
			this.#maxWorkers = Math.min(CPUS * 2, maxWorkers);
		}

		if (options.workerFile) {
			const filename = options.workerFile.replace(/\\/g, "/");
			if (!/\.(c|m)?js|\.ts$/i.test(filename)) {
				throw new Error("Worker file must be `.js`, `.mjs`, `.cjs` or `.ts`.");
			}
			this.#eval = extname(filename).toLowerCase() === '.ts';
			this.#scriptFile = this.#eval ? `require('ts-node').register();require("${filename}");` : filename;
		} else if (options.workerScript) {
			this.#scriptFile = options.workerScript;
			this.#eval = true;
		} else {
			throw new Error('workerFile or workerScript must be one specified');
		}

		const timeout = options.timeout;
		if (timeout != null) {
			if (!Number.isInteger(timeout) || timeout <= 0) {
				throw new Error('timeout must be a positive integer');
			}
			this.#timeout = timeout;
		}

		for (let i = 0; i < this.#maxWorkers; i++) this.#addNewWorker();
	}

	#createWorker(): CustomWorker {
		const { port1, port2 } = new MessageChannel();
		const worker = new Worker(this.#scriptFile, {
			eval: this.#eval,
			workerData: { lock: this.#eventMutex.buffer, port: port1, timeout: this.#timeout },
			transferList: [port1],
		}) as CustomWorker;
		worker.port = port2;
		return worker;
	}

	#addNewWorker() {
		const worker = this.#createWorker();

		worker.port.on("message", ({ event, message }) => this.emit(event, message));

		worker.on("message", (result: any) => {
			const taskInfo = worker.taskInfo!;
			worker.taskInfo = undefined;
			taskInfo.done(undefined, result);
			this.#mutex.sync(() => this.#freeWorkers.push(worker));
			this.#runNext();
		});

		worker.on("error", (error: any) => {
			if (worker.taskInfo) {
				worker.taskInfo.done(error);
			} else {
				this.emit("error", error);
			}
			worker.port.removeAllListeners();
			worker.removeAllListeners();
			this.#mutex.sync(() => this.#workers.splice(this.#workers.indexOf(worker), 1));
			this.#addNewWorker();
		});

		this.#mutex.sync(() => {
			this.#workers.push(worker);
			this.#freeWorkers.push(worker);
		});
		this.#runNext();
	}

	#runNext() {
		const task = this.#tasks.shift();
		if (task) {
			this.#run(task.task, task.callback);
		}
	}

	#run<T, R>(task: T, callback: Callback<R>) {
		if (this.#closed) throw CLOSED_ERROR;
		const worker = this.#mutex.sync(() => this.#freeWorkers.shift());
		if (worker) {
			worker.taskInfo = new TaskInfo(callback, task);
			worker.postMessage(task ?? {});
		} else {
			this.#tasks.push({ task, callback });
		}
	}

	#runOne<T, R>(task: T): Promise<R> {
		return new Promise<R>((resolve, reject) => {
			this.#run<T, R>(task, (error?: any, result?: R) => {
				if (error) return reject(error);
				resolve(result as R);
			});
		});
	}

	async #runMany<T, R>(tasks: T[]): Promise<Results<R>> {
		const all = await Promise.allSettled(tasks.map(task => this.#runOne<T, R>(task)));
		const errors = (all.filter(result => result.status === "rejected") as PromiseRejectedResult[])
			.map(x => x.reason as WorkerError);
		const results = (all.filter(result => result.status === "fulfilled") as PromiseFulfilledResult<R>[])
			.map(x => x.value);
		return { results, errors };
	}

	run<T, R>(task: T, callback: Callback<R>): void;
	run<T, R>(task: T): Promise<R>;
	run<T, R>(tasks: T[]): Promise<Results<R>>;
	run<T, R>(input: T | T[], callback?: Callback<R>): void | Promise<R | Results<R>> {
		if (typeof callback === "function") {
			this.#run<T, R>(input as any, callback);
		} else {
			return Array.isArray(input) ?
				this.#runMany<T, R>(input) :
				this.#runOne<T, R>(input);
		}
	}

	static run<T, R>(options: Options, task: T): Promise<R>;
	static run<T, R>(options: Options, tasks: T[], emit?: (message: any) => void): Promise<Results<R>>;
	static async run<T, R>(options: Options, input: T | T[], emit?: (message: any) => void): Promise<R | Results<R>> {
		if (input == null) throw new Error("task must be defined");
		const tasks: T[] = Array.isArray(input) ? input : [input];
		options.maxWorkers = options.maxWorkers || tasks.length;
		const pool = new WorkerPool(options);
		if (typeof emit === 'function') {
			pool.on('message', message => emit(message));
		}
		try {
			if (Array.isArray(input)) {
				return await pool.run<T, R>(input);
			} else {
				return await pool.run<T, R>(input);
			}
		} finally {
			await pool.close();
		}
	}

	async close() {
		this.#mutex.lock();
		if (!this.#closed) {
			this.#closed = true;
			await Promise.allSettled(this.#workers.map(closeWorker));
			this.#workers = [];
			this.#freeWorkers = [];
		}
		this.#mutex.unlock();
	}
}

export function startWorker<T = unknown, R = unknown>(fn: (input: T, emit: (event: string, message: any) => void) => Promise<R>) {
	if (isMainThread) {
		throw new Error("startWorker can only be used in a worker thread.");
	}

	const timeout: number = workerData.timeout;
	const mutex = new Mutex(workerData.lock);
	const port: MessagePort = workerData.port;
	const emit = (event: string, message: any) => {
		mutex.sync(() => port.postMessage({ event, message }));
	};

	parentPort!.on("message", async (request: T) => {
		try {
			const value = timeout > 0 ?
				await timedFn(() => fn(request, emit), timeout) :
				await fn(request, emit);
			parentPort!.postMessage({ status: "fulfilled", value });
		} catch (reason: any) {
			parentPort!.postMessage({ status: "rejected", reason });
		}
	});
}

async function timedFn<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
	let t: any;
	const result = await Promise.race([
		new Promise<void>((_, reject) => {
			t = setTimeout(() => reject(new Error("timeout")), timeout);
		}),
		fn().then(res => {
			clearTimeout(t);
			return res;
		}),
	]);
	return result as T;
}

async function closeWorker(worker: any) {
	try {
		worker.port.close();
	} catch (ex) {}
	if (TERMINATE_PROMISE_SUPPORT) {
		try {
			await worker.terminate();
		} catch (ex) {}
	} else {
		try {
			await new Promise((resolve) => worker.terminate(resolve));
		} catch (ex) {}
	}
}
