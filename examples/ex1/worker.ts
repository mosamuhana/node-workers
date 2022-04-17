import Axios from "axios";
import { startWorker, IEmitter } from "../../src";

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

startWorker<string, number>(async (e: IEmitter<string>) => {
	try {
		e.emit('message', "Start worker #" + e.request?.id);
		return await getDownloadSize(e.data);
	} finally {
		e.emit('message', "End worker #" + e.request?.id);
	}
});
