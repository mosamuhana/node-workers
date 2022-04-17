# @devteks/node-workers

Worker threads for node.js

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

### in the main thread file `main.ts`

```typescript
import { join } from "path";
import { WorkerPool, IEvent } from "../../src";

const urls = [
	"https://proof.ovh.net/files/100Mb.dat",
	"http://ipv4.download.thinkbroadband.com/200MB.zip",
	"https://example.com/unknown/path",
];

async function main() {
	const pool = new WorkerPool<string, number>(join(__dirname, "./worker.ts"), urls.length);
	pool.on('message', (e: IEvent) => console.log('ON MESSAGE', e.request, e.data));

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
```

### in the worker thread worker.ts

```typescript
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
```

------

clone the repository and try examples in the `examples` folder
