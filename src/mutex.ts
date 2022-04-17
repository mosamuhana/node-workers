const UNLOCKED = 0;
const LOCKED = 1;

// copied from https://github.com/mosamuhana/node-atomics
export class Mutex {
  static from(buffer: SharedArrayBuffer | Int32Array): Mutex {
    return new Mutex(buffer);
  }

  #array: Int32Array;

  constructor(input?: SharedArrayBuffer | Int32Array) {
		if (input == null) {
			this.#array = new Int32Array(new SharedArrayBuffer(4));
		} else if (input instanceof SharedArrayBuffer) {
			if (input.byteLength != 4) {
				throw new Error("Mutex buffer must be 4 bytes.");
			}
			this.#array = new Int32Array(input);
		} else if (input instanceof Int32Array) {
			if (input.length != 1) {
				throw new Error("Mutex buffer must be 4 bytes.");
			}
			this.#array = input;
		} else {
			throw new Error(`Invalid parameter type`)
		}
  }

  get buffer() {
    return this.#array.buffer as SharedArrayBuffer;
  }

  lock() {
		while (true) {
			if (Atomics.compareExchange(this.#array, 0, UNLOCKED, LOCKED) === UNLOCKED) return;
			Atomics.wait(this.#array, 0, LOCKED);
		}
	}

  unlock() {
		if (Atomics.compareExchange(this.#array, 0, LOCKED, UNLOCKED) !== LOCKED) {
			throw new Error("Inconsistent state: unlock on unlocked Mutex.");
		}
		Atomics.notify(this.#array, 0, 1);
	}

	synchronize<T>(fn: () => T): T {
		try {
			this.lock();
			return fn();
		} finally {
			this.unlock();
		}
	}

	async asynchronize<T>(fn: () => Promise<T>): Promise<T> {
		this.lock();
		try {
			return await fn();
		} finally {
			this.unlock();
		}
	}
}
