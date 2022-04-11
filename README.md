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

### in the main thread file main.ts

```typescript
import { join } from "path";
import { WorkerPool } from '@devteks/node-workers';

const urls = [
  "https://proof.ovh.net/files/100Mb.dat",
  "https://example.com/some/unknown/link",
];

async function main() {
  const workerFile = join(__dirname, "./worker.ts");
  // - first argument is the absolute path for the worker script file
  //   valid worker extensions .js, .mjs, .cjs, and .ts
  // - second argument is optional `maxWorkers` must be > 0
  //   if not set default to require('os').cpus().length
  const pool = new WorkerPool<string, number>(workerFile, urls.length);
  pool.on('message', (msg: {id: number, message: any}) => {
    // message from worker using `notifier.notify(message)`
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
```

### in the worker thread worker.ts

```typescript
import { startWorker } from '@devteks/node-workers';

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

startWorker<string, number>(async notifier => {
	try {
		notifier.notify("Start worker #" + notifier.id);
		return await getDownloadSize(notifier.data!);
	} catch (ex) {
		throw ex;
	} finally {
		notifier.notify("End worker #" + notifier.id);
	}
});
```
