import { threadId } from "worker_threads";
import { setTimeout as delay } from "timers/promises";
//import { queueMicrotask } from "timers";

import { startWorker } from "../../src";
import Axios from "axios";

import { IRequest, IResponse } from "./main";

async function getDownloadSize(url: string) {
	try {
		const response = await Axios({ method: "HEAD", url });
		const contentLength = response.headers["content-length"];
		if (contentLength) {
			const length = parseInt(contentLength, 10);
			if (!isNaN(length)) {
				return length;
			}
		}
	} catch (ex) {}
	throw new Error("Failed to get size");
}

startWorker<IRequest, IResponse>(async ({ index, url }, emit) => {
	try {
		emit('message', "Start worker #" + index);
		let time = Date.now();
		const size = await getDownloadSize(url);
		time = Date.now() - time;
		const response: IResponse = {
			index,
			size,
			time,
			threadId,
		};
		return response;
	} finally {
		emit('message', "End worker #" + index);
	}
});

/*
startWorker<IRequest, IResponse>(async ({ index, url }, emit) => {
	try {
		//emit('message', "Start worker #" + index);
		//emit('message', { index, url });
		let time = Date.now();
		await delay(1000);
		const size = 1000;
		time = Date.now() - time;
		const response: IResponse = {
			index,
			size,
			time,
			threadId,
		};
		return response;
	} finally {
		//emit('message', "End worker #" + index);
		//emit('message', { index, url });
	}
});
*/
