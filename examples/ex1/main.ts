import { join } from "path";
import { WorkerPool, IEvent } from "../../src";

const urls = [
	"https://proof.ovh.net/files/100Mb.dat",
	"http://ipv4.download.thinkbroadband.com/200MB.zip",
	"https://example.com/unknown/path",
];

async function main() {
	const pool = new WorkerPool<string, number>(join(__dirname, "./worker.ts"), urls.length);
	pool.on('message', (e: IEvent) => {
		console.log('ON MESSAGE', e.request, e.data);
	});
	const results = await Promise.all(
		urls.map((data, index) => pool.runTask({ data, id: index + 1 }))
	);
	results.forEach(result => {
		if (result.error) result.error = result.error.message;
	});
	console.table(results);
	await pool.close();
}

main();
