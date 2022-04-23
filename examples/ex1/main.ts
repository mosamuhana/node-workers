import { join } from "path";
import { WorkerPool } from "../../src";

export interface IRequest {
	url: string;
	index: number;
}

export interface IResponse {
	index: number;
	size: number;
	time: number;
	threadId: number;
}

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

	//"https://example.com/unknown/path",

	//"https://filesamples.com/samples/document/txt/sample1.txt",
	//"https://filesamples.com/samples/document/txt/sample2.txt",
	//"https://filesamples.com/samples/document/txt/sample3.txt",
];

const tasks = urls.map<IRequest>((url, index) => ({ url, index }));
const workerFile = join(__dirname, "./worker.ts");

async function main1() {
	const pool = new WorkerPool({ workerFile, maxWorkers: 2 });
	pool.on('message', (message: any) => console.log('ON MESSAGE', message));
	let workTime = Date.now();
	const results = await pool.run<IRequest, IResponse>(tasks);
	workTime = Date.now() - workTime;
	await pool.close();

	const totalTime = results.results.reduce((prev, curr) => prev + curr.time, 0);

	console.log('totalTime:', (totalTime / 1000).toFixed(2), 'seconds');
	console.log('workTime:', (workTime / 1000).toFixed(2), 'seconds');

	console.table(results.results);
	console.log(results.errors);
}

async function main() {
	let workTime = Date.now();
	const results = await WorkerPool.run<IRequest, IResponse>(
		{ workerFile, timeout: 1500 },
		tasks,
		x => console.log(x),
	);
	workTime = Date.now() - workTime;

	const totalTime = results.results.reduce((prev, curr) => prev + curr.time, 0);

	console.log('totalTime:', (totalTime / 1000).toFixed(2), 'seconds');
	console.log('workTime:', (workTime / 1000).toFixed(2), 'seconds');

	console.table(results.results);
	console.log(results.errors);
}

main();
