const { WorkerPool } = require('../../');

const urls = [
	"https://proof.ovh.net/files/1Mb.dat",
	"https://proof.ovh.net/files/10Mb.dat",
	"https://proof.ovh.net/files/100Mb.dat",
	"https://proof.ovh.net/files/1Gb.dat",
	"https://proof.ovh.net/files/10Gb.dat",

	"http://ipv4.download.thinkbroadband.com/5MB.zip",
	"http://ipv4.download.thinkbroadband.com/10MB.zip",
	"http://ipv4.download.thinkbroadband.com/20MB.zip",
	"http://ipv4.download.thinkbroadband.com/50MB.zip",
	"http://ipv4.download.thinkbroadband.com/100MB.zip",
	"http://ipv4.download.thinkbroadband.com/200MB.zip",
	"http://ipv4.download.thinkbroadband.com/512MB.zip",
	"http://ipv4.download.thinkbroadband.com/1GB.zip",
	/*
	*/

	//"https://example.com/unknown/path",

	//"https://filesamples.com/samples/document/txt/sample1.txt",
	//"https://filesamples.com/samples/document/txt/sample2.txt",
	//"https://filesamples.com/samples/document/txt/sample3.txt",
];

const tasks = urls.map((url, index) => ({ url, index }));
// D:/2022/MY_REPOS/node-workers/dist/index.js
const WORKER_SCRIPT = `
const { threadId } = require('worker_threads');
const axios = require('axios');
//const { startWorker } = require('../../');
const { startWorker } = require('D:/2022/MY_REPOS/node-workers/dist/index.js');

async function getDownloadSize(url) {
	try {
		const response = await axios({ method: "HEAD", url });
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
`;

async function main() {
	const pool = new WorkerPool({ workerScript: WORKER_SCRIPT, maxWorkers: urls.length });

	pool.on('message', message => {
		console.log(message);
	});

	let workTime = Date.now();
	const results = await pool.run(tasks);
	workTime = Date.now() - workTime;
	await pool.close();

	const totalTime = results.results.reduce((prev, curr) => prev + curr.time, 0);

	console.log('totalTime:', (totalTime / 1000).toFixed(2), 'seconds');
	console.log('workTime:', (workTime / 1000).toFixed(2), 'seconds');

	console.table(results.results);
	console.log(results.errors);
}

main();
