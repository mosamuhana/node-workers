const UNLOCKED = 0;
const LOCKED = 1;

// copied from https://github.com/mosamuhana/node-atomics
export class Mutex {
  #array: Int32Array;

  constructor(input?: SharedArrayBuffer) {
		this.#array =  new Int32Array(input || new SharedArrayBuffer(4));
  }

  get buffer() { return this.#array.buffer as SharedArrayBuffer; }

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

	sync<T>(fn: () => T): T {
		try {
			this.lock();
			return fn();
		} finally {
			this.unlock();
		}
	}
}
