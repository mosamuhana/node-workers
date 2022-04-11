const enum State {
	UNLOCKED = 0,
	LOCKED = 1
}

export class WorkerLock {
	#buffer: SharedArrayBuffer;
	#data: Int32Array;

	/*
	constructor(data?: Int32Array | SharedArrayBuffer) {
		if (data == null) {
			data = new Int32Array(new SharedArrayBuffer(4));
		} else {
			if (data instanceof SharedArrayBuffer) {
				data = new Int32Array(data);
			}
			if (!(data instanceof Int32Array)) {
				throw new Error('`data` invalid lock data');
			}
		}

		this.#data = data;
	}
	*/

	constructor(data?: Int32Array | SharedArrayBuffer) {
		if (data == null) {
			this.#buffer = new SharedArrayBuffer(4);
			this.#data = new Int32Array(this.#buffer);
		} else {
			if (data instanceof SharedArrayBuffer) {
				this.#data = new Int32Array(this.#buffer = data);
			} else if (data instanceof Int32Array) {
				this.#buffer = data.buffer as SharedArrayBuffer;
				this.#data = data;
			} else {
				throw new Error('`data` invalid lock data');
			}
		}
	}

	get buffer() { return this.#buffer; }

	lock(): void {
		while (true) {
			const oldValue = Atomics.compareExchange(this.#data, 0, State.UNLOCKED, State.LOCKED);
			if (oldValue === State.UNLOCKED) return;
			Atomics.wait(this.#data, 0, State.LOCKED);
		}
	}

	unlock(): void {
		const oldValue = Atomics.compareExchange(this.#data, 0, State.LOCKED, State.UNLOCKED);
		if (oldValue != State.LOCKED) {
			throw new Error("Tried to unlock while not holding the mutex");
		}
		Atomics.notify(this.#data, 0, 1);
	}
}
