import { parentPort, threadId, isMainThread } from "worker_threads";

import { WorkerLock } from './lock';

export interface Notifier<T = unknown> {
    get id(): number;
    get data(): T | undefined | null;
    notify(message: any): void;
}

export function startWorker<T = unknown, R = unknown>(fn: (notifier: Notifier<T>) => Promise<R>) {
    if (isMainThread) throw new Error('WorkerTaskRunner can only be used in a worker thread.');
    parentPort!.on("message", async ({ id, data, port, lock }: any) => {
        const _lock = new WorkerLock(lock);
        const notify = (message: any) => {
            try {
                _lock.lock();
                port.postMessage({ id, message });
            } finally {
                _lock.unlock();
            }
        };
        const notifier = Object.freeze({ id, data, notify });
        try {
            const response = await fn(notifier);
            parentPort!.postMessage({ id, threadId, response })
        } catch (error) {
            parentPort!.postMessage({ id, threadId, error });
        }
    });
}
