import { join } from "path";
import { WorkerPool } from "../../src";

const urls = [
	"https://proof.ovh.net/files/100Mb.dat",
	"http://ipv4.download.thinkbroadband.com/200MB.zip",
	"https://example.com/unknown/path",
];

async function main() {
	const pool = new WorkerPool<string, number>(join(__dirname, "./worker.ts"), urls.length);
	pool.on('message', (msg: {id: number, message: any}) => {
		console.log(msg);
	});
	const results = await Promise.all(
		urls.map((data, index) => pool.runTask({ data, id: index + 1 }))
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
