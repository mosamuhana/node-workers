import { cpus } from "os";
import { AsyncResource } from "async_hooks";
import { EventEmitter } from "events";
import { Worker, MessageChannel } from "worker_threads";
import { extname } from "path";

import { Mutex } from "./mutex";
import { IRequest, IResponse } from "./types";

const AVAILABLE_CPUS = cpus().length;
const TERMINATE_PROMISE_SUPPORT = (() => {
	const [ major, minor ] = process.version.replace("v", "").split(".").map((x) => parseInt(x, 10));
	return major >= 12 && minor >= 5;
})();

const CLOSED_ERROR = new Error("WorkerPool is closed");

class TaskInfo extends AsyncResource {
	constructor(private cb: any) {
		super("TaskInfo");
	}
	done(error?: any, result?: any) {
		this.runInAsyncScope(this.cb, null, error, result);
		this.emitDestroy();
	}
}

type CustomWorker = Worker & { taskInfo?: TaskInfo };

export class WorkerPool<T = unknown, R = unknown> extends EventEmitter {
	#filename: string;
	#isTs: boolean = false;
	#maxWorkers: number;
	#workers: CustomWorker[] = [];
	#freeWorkers: CustomWorker[] = [];
	#requests: { request?: IRequest<T>; callback: any }[] = [];
	#mutex: Mutex;
	#closed = false;

	get maxWorkers() { return this.#maxWorkers; }

	constructor(filename: string, maxWorkers?: number) {
		super();
		if (maxWorkers == null) {
			maxWorkers = AVAILABLE_CPUS;
		} else {
			if (maxWorkers < 1 || !Number.isInteger(maxWorkers)) {
				throw new Error("maxWorkers must be an integer greater than 0");
			}
			maxWorkers = Math.min(AVAILABLE_CPUS, maxWorkers);
		}

		filename = filename.replace(/\\|\//g, "/");

		if (!/\.(c|m)?js|\.ts$/i.test(filename)) {
			throw new Error("Worker file must be `.js`, `.mjs`, `.cjs` or `.ts`.");
		}

		this.#isTs = extname(filename).toLowerCase() === ".ts";
		this.#filename = filename;
		this.#mutex = new Mutex();
		this.#maxWorkers = maxWorkers;

		for (let i = 0; i < maxWorkers; i++) this.#addNewWorker();
	}

	#addNewWorker() {
		const filename = !this.#isTs ? this.#filename : `require('ts-node').register();require("${this.#filename}");`;

		const channel = new MessageChannel();
		const worker = new Worker(filename, {
			eval: this.#isTs,
			workerData: { lock: this.#mutex.buffer, port: channel.port1 },
			transferList: [channel.port1],
		}) as CustomWorker;

		channel.port2.on("message", ({ event, message }) => this.emit(event, message));

		worker.on("message", (result: any) => {
			const taskInfo = worker.taskInfo!;
			worker.taskInfo = undefined;
			taskInfo.done(undefined, result);
			this.#freeWorkers.push(worker);
			this.#runNext();
		});

		worker.on("error", (error: any) => {
			if (worker.taskInfo) {
				worker.taskInfo.done(error);
			} else {
				this.emit("error", error);
			}
			channel.port2.removeAllListeners();
			worker.removeAllListeners();
			this.#workers.splice(this.#workers.indexOf(worker), 1);
			this.#addNewWorker();
		});

		this.#workers.push(worker);
		this.#freeWorkers.push(worker);
		this.#runNext();
	}

	#runNext() {
		if (this.#requests.length > 0) {
			const { request, callback } = this.#requests.shift()!;
			this.runTaskSync(request, callback);
		}
	}

	runTaskSync(request: IRequest<T> | undefined, callback: (error?: any, result?: IResponse<R>) => void) {
		if (this.#closed) throw CLOSED_ERROR;
		if (this.#freeWorkers.length === 0) {
			this.#requests.push({ request, callback });
			return;
		}

		const taskWorker = this.#freeWorkers.shift()!;
		taskWorker.taskInfo = new TaskInfo(callback);
		taskWorker.postMessage(request);
	}

	runTask(request?: IRequest<T>) {
		if (this.#closed) throw CLOSED_ERROR;
		return new Promise<IResponse<R>>((resolve, reject) => {
			this.runTaskSync(request, (error, result) => {
				if (error) {
					reject(error);
				} else {
					resolve(result!);
				}
			});
		});
	}

	async close() {
		if (this.#closed) return;
		this.#closed = true;

		const workers: any[] = this.#workers;

		if (TERMINATE_PROMISE_SUPPORT) {
			await Promise.all(
				workers.map(async worker => {
					try {
						await worker.terminate();
					} catch (ex) {}
				})
			);
		} else {
			await Promise.all(
				workers.map(worker => new Promise<void>((resolve) => {
					try {
						worker.terminate(resolve);
					} catch (ex) {
						resolve();
					}
				}))
			);
		}

		this.#workers = [];
	}
}
