import { join } from "path";

import { WorkerPool } from "../src";

const urls = [
	"https://proof.ovh.net/files/100Mb.dat",
	"https://example.com/unknown/path",
];

async function main() {
	const pool = new WorkerPool<string, number>(join(__dirname, "./worker.ts"), urls.length);
	pool.on('message', (msg: {id: number, message: any}) => {
		console.log(msg);
	});
	const results = await Promise.all(
		urls.map((url, id) => pool.runTask(id, url))
	);
	results.forEach(result => {
		if (result.error) {
			result.error = result.error instanceof Error ? result.error.message : result.error;
		}
	});
	console.table(results);
	await pool.close();
}

main();
