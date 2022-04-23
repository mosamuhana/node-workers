const { threadId } = require('worker_threads');
const Axios = require('axios');
const { startWorker } = require('../../');

async function getDownloadSize(url) {
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

startWorker(async ({ index, url }, emit) => {
	try {
		emit('message', "Start worker #" + index);
		let time = Date.now();
		const size = await getDownloadSize(url);
		time = Date.now() - time;
		return {
			index,
			size,
			time,
			threadId,
		};
	} finally {
		emit('message', "End worker #" + index);
	}
});
