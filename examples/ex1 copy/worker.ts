import Axios from "axios";
import { startWorker } from "../../src";

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

startWorker<string, number>(async job => {
	try {
		job.notify("Start worker #" + job.request?.id);
		return await getDownloadSize(job.data);
	} catch (ex) {
		throw ex;
	} finally {
		job.notify("End worker #" + job.request?.id);
	}
});
