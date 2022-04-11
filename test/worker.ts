import Axios from "axios";

import { startWorker } from "../src";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36";

async function getDownloadSize(url: string) {
	try {
		const response = await Axios({ method: "HEAD", url, headers: { "User-Agent": USER_AGENT } });
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
		job.notify("Start worker #" + job.id);
		return await getDownloadSize(job.data!);
	} catch (ex) {
		throw ex;
	} finally {
		job.notify("End worker #" + job.id);
	}
});
