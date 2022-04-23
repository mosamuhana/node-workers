# <a href="https://www.npmjs.com/package/@devteks/node-workers">@devteks/node-workers</a>


Simple and easy to use worker pool implementation for Node.js.

## how to use
`npm install @devteks/node-workers --save`

## Import:
import:
```javascript
const { WorkerPool, startWorker } = require('@devteks/node-workers');
// OR
import { WorkerPool, startWorker } from '@devteks/node-workers';
```

## Usage:

### `WorkerPool` class
used only in main thread.

```typescript
interface Options {
	workerFile: string;   // path to worker file (.js, mjs, .cjs and .ts)
	maxWorkers?: number;  // max number of workers
	timeout?: number;     // timeout for worker to finish task
}

class WorkerPool extends EventEmitter {
	constructor(options: Options);
	get maxWorkers(): number;
	// instance run function
	run<T, R>(task: T, callback: Callback<R>): void;
	run<T, R>(task: T): Promise<R>;
	run<T, R>(tasks: T[]): Promise<Results<R>>;
	// close: function to terminate all workers at the end of the program
	close(): Promise<void>;

	// static run function
	static run<T, R>(options: Options, task: T): Promise<R>;
	static run<T, R>(options: Options, tasks: T[], emit?: (message: any) => void): Promise<Results<R>>;
}
```


### `startWorker` function
used only in worker thread.

```typescript
function startWorker<T, R>(
	fn: (input: T, emit: (event: string, message: any) => void) => Promise<R>
): void;
```

## Example:

### in the main thread file `main.js`

```javascript
const { join } = require('path');
const { WorkerPool } = require('@devteks/node-workers');

const urls = [
	"https://proof.ovh.net/files/1Mb.dat",
	"https://proof.ovh.net/files/10Mb.dat",
	"https://proof.ovh.net/files/100Mb.dat",
	"http://ipv4.download.thinkbroadband.com/5MB.zip",
	"http://ipv4.download.thinkbroadband.com/10MB.zip",
	"http://ipv4.download.thinkbroadband.com/20MB.zip",
];
const tasks = urls.map((url, index) => ({ url, index }));
const workerFile = join(__dirname, "./worker.js");

async function main() {
	const pool = new WorkerPool({ workerFile, maxWorkers: urls.length });

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
```

### in the worker thread `worker.js`

```javascript
const { threadId } = require('worker_threads');
const Axios = require('axios');
const { WorkerPool } = require('@devteks/node-workers');

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
```

## clone the repository and try examples in the `examples` folder
