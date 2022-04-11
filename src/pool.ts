import { cpus } from "os";
import { AsyncResource } from "async_hooks";
import { EventEmitter } from "events";
import { Worker, WorkerOptions, MessageChannel } from "worker_threads";
import { extname } from "path";

import { WorkerLock } from './lock';

const AVAILABLE_CPUS = cpus().length;
const [NODE_MAJOR, NODE_MINOR] = process.version.replace("v", "").split(".").map(x => parseInt(x, 10));
const CLOSED_ERROR = new Error("WorkerPool is closed");

export interface TaskResponse<T = unknown> {
    id: number;
    threadId: number;
	response?: T;
	error?: any;
}

class TaskInfo extends AsyncResource {
	constructor(private cb: any) {
		super("TaskInfo");
	}
	done(error?: any, result?: any) {
		this.runInAsyncScope(this.cb, null, error, result);
		this.emitDestroy();
	}
}

interface TaskWorker {
	id?: number;
	worker: Worker;
	taskInfo?: TaskInfo;
	channel?: MessageChannel;
}

export class WorkerPool<T = unknown, R = unknown> extends EventEmitter {
	#filename: string;
	#isTs: boolean = false;
	#maxWorkers: number;
	#workers: Worker[] = [];
	#taskWorkers: TaskWorker[] = [];
	#requests: {id: number, data: any, callback: any}[] = [];
	#lock: WorkerLock;
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
		//if (!/\.(c|m)?(j|t)s$/i.test(filename))
		if (!/\.(c|m)?js|\.ts$/i.test(filename)) {
			throw new Error("Worker file must be `.js`, `.mjs`, `.cjs` or `.ts`.");
		}

		this.#isTs = extname(filename).toLowerCase() === '.ts';
		this.#filename = filename;
		this.#lock = new WorkerLock();
		this.#maxWorkers = maxWorkers;
		for (let i = 0; i < maxWorkers; i++) this.#addNewWorker();
	}

	#createWorker() {
		const workerOptions: WorkerOptions = {
			eval: false,
		};
		if (this.#isTs) {
			workerOptions.eval = true;
			return new Worker(`require('ts-node').register(); require("${this.#filename}");`, workerOptions);
		}
		return new Worker(this.#filename, workerOptions);
	}

	#addNewWorker() {
		const worker = this.#createWorker();
		const taskWorker: TaskWorker = { worker };

		const onMessage = (result: any) => {
			const taskInfo = taskWorker.taskInfo!;
			taskWorker.taskInfo = undefined;
			taskInfo.done(undefined, result);
			this.#taskWorkers.push(taskWorker);
			this.#runNext();
		};

		const onError = (error: any) => {
			const taskInfo = taskWorker.taskInfo;
			if (taskInfo) {
				taskInfo.done(error);
			} else {
				this.emit("error", error);
			}
			worker.off("message", onMessage);
			worker.off("error", onError);
			this.#workers.splice(this.#workers.indexOf(worker), 1);
			this.#addNewWorker();
		};

		worker.on("message", onMessage);
		worker.on("error", onError);

		this.#workers.push(worker);
		this.#taskWorkers.push(taskWorker);
		this.#runNext();
	}

	#runNext() {
		if (this.#requests.length > 0) {
			const { id, data, callback } = this.#requests.shift()!;
			this.runTaskSync(id, data, callback);
		}
	}

	runTaskSync(
		id: number,
		data: T | undefined | null,
		callback: (error?: any, result?: TaskResponse<R>) => void
	) {
		if (this.#closed) throw CLOSED_ERROR;
		if (this.#taskWorkers.length === 0) {
			this.#requests.push({ id, data, callback });
			return;
		}

		const taskWorker = this.#taskWorkers.shift()!;

		const channel = new MessageChannel();
		taskWorker.id = id;
		taskWorker.channel = channel;
		taskWorker.taskInfo = new TaskInfo(callback);

		channel.port2.on("message", message => this.emit('message', message));

		const port = channel.port1;
		const message: any = { id, data, port, lock: this.#lock.buffer };
		taskWorker.worker.postMessage(message, [port]);
	}

	runTask(id: number, data?: T | null) {
		if (this.#closed) throw CLOSED_ERROR;
		return new Promise<TaskResponse<R>>((resolve, reject) => {
			this.runTaskSync(id, data, (error, result) => {
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
		await terminate(this.#workers);
		this.#workers = [];
	}

}

async function terminate(workers: any[]): Promise<void> {
	if (NODE_MAJOR >= 12 && NODE_MINOR >= 5) {
		await Promise.all(workers.map(x => x.terminate()));
	} else {
		await Promise.all(
			workers.map(worker => new Promise<void>(resolve => {
				try {
					worker.terminate(resolve);
				} catch (ex) {
					resolve();
				}
			}))
		);
	}
}
