import { parentPort, isMainThread, workerData, MessagePort } from "worker_threads";

import { Mutex } from "./mutex";
import { IRequest, IResponse, IEmitter, IEvent } from "./types";

export function startWorker<T = unknown, R = unknown>(fn: (notifier: IEmitter<T>) => Promise<R>) {
	if (isMainThread) {
		throw new Error("startWorker can only be used in a worker thread.");
	}

	const mutex = Mutex.from(workerData.lock);
	const port: MessagePort = workerData.port;

	function createEmitter<T>(data: T, request?: Record<string, any>): IEmitter<T> {
		const emitter: IEmitter<T> = {
			data,
			request,
			emit(event: string, data: any) {
				const message: IEvent = { request, data };
				mutex.synchronize(() => port.postMessage({ event, message }));
			}
		};

		return Object.freeze(emitter);
	}

	parentPort!.on("message", async (input: IRequest<T>) => {
		const { data, ...rest } = input || {};
		const request = Object.keys(rest).length > 0 ? rest : undefined;
		const emitter = createEmitter<T>(data as T, request);
		const res: IResponse<R> = {};
		request && (res.request = request);
		try {
			res.response = await fn(emitter);
		} catch (e: any) {
			res.error = new Error(e.message || e || 'Unknown error');
			res.error.stack = e?.stack;
		}
		parentPort!.postMessage(res);
	});
}
