/**
 * Go-style channels for CSP (Communicating Sequential Processes).
 *
 * Provides typed, bidirectional communication channels inspired by Go.
 * Perfect for coordinating async operations and implementing concurrent patterns.
 *
 * @example
 * const ch = channel<number>()
 *
 * // Sender
 * await ch.send(42)
 *
 * // Receiver
 * const value = await ch.receive()
 *
 * // Select from multiple channels
 * const result = await select(
 *   ch1.case((v) => console.log('ch1:', v)),
 *   ch2.case((v) => console.log('ch2:', v))
 * )
 */

import { asyncQueue, type AsyncQueue } from "./async-queue.js";

/**
 * Channel<T> - Bidirectional communication channel.
 *
 * Inspired by Go channels. Provides send/receive operations
 * that can block until the other side is ready.
 */
export class Channel<T> {
  private queue: AsyncQueue<T>;
  private _isClosed = false;

  constructor(bufferSize: number = 0) {
    // A buffer size of 0 is an unbuffered channel: send waits for a receiver (a rendezvous).
    // (Before, `bufferSize || 1` gave it a buffer of 1: BUGS-2026-07 L17.)
    this.queue = asyncQueue<T>({ capacity: bufferSize });
  }

  /**
   * Sends a value through the channel.
   * Blocks if channel buffer is full.
   *
   * @throws Error if channel is closed
   */
  async send(value: T): Promise<void> {
    if (this._isClosed) {
      throw new Error("Cannot send on closed channel");
    }
    await this.queue.put(value);
  }

  /**
   * Receives a value from the channel.
   * Blocks if no value is available.
   *
   * @throws Error if channel is closed and empty
   */
  async receive(): Promise<T> {
    return await this.queue.take();
  }

  /**
   * This method waits for one value, as `receive` does, and gives it to `onValue`. When the
   * channel is closed and empty, it calls `onClosed`. These calls are synchronous: they occur in
   * the call that sends the value or closes the channel.
   *
   * The function that it returns withdraws the wait, so no later value goes to it.
   *
   * @returns A function that withdraws the wait. It returns true when the wait had no value yet.
   */
  waitReceive(onValue: (value: T) => void, onClosed: (error: Error) => void): () => boolean {
    return this.queue.waitTake(onValue, onClosed);
  }

  /**
   * Attempts to send without blocking.
   * Returns false if channel is full.
   */
  trySend(value: T): boolean {
    if (this._isClosed) return false;
    return this.queue.tryPut(value);
  }

  /**
   * Attempts to receive without blocking.
   * Returns undefined if no value is available.
   */
  tryReceive(): T | undefined {
    return this.queue.tryTake();
  }

  /**
   * Closes the channel. No more values can be sent.
   * Receivers can still drain remaining values.
   */
  close(): void {
    this._isClosed = true;
    this.queue.close();
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  get size(): number {
    return this.queue.size;
  }

  /**
   * Creates a select case for this channel.
   * Used with the select() function for multiplexing.
   */
  case<R>(handler: (value: T) => R): SelectCase<R> {
    return {
      channel: this,
      handler,
      tryReceive: () => this.tryReceive(),
      receive: () => this.receive(),
      wait: (onValue, onClosed) => this.waitReceive(onValue, onClosed),
    };
  }

  /**
   * Async iteration over channel values.
   * Stops when channel is closed and empty.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      try {
        yield await this.receive();
      } catch (e) {
        // Channel closed
        break;
      }
    }
  }
}

/**
 * SelectCase represents a case in a select statement.
 */
export interface SelectCase<R> {
  channel: Channel<any>;
  handler: (value: any) => R;
  tryReceive: () => any;
  receive: () => Promise<any>;
  /**
   * A wait for one value that `select` can withdraw: `Channel.waitReceive`. A case without it
   * uses the `waitReceive` method of its channel.
   */
  wait?: (onValue: (value: any) => void, onClosed: (error: Error) => void) => () => boolean;
}

/** A wait for one value that can be withdrawn, as `Channel.waitReceive` gives it. */
type Wait = (onValue: (value: unknown) => void, onClosed: (error: Error) => void) => () => boolean;

/**
 * This function gives the first value of the waits, with the index of its wait. It rejects with
 * the error of the first wait whose channel is closed and empty. It withdraws each other wait in
 * the same call, so a later value stays in its channel. (Before, the receives of the cases that
 * lost stayed in their channels and dropped the next value of each: audit O56.)
 */
function firstOf(waits: readonly Wait[]): Promise<{ index: number; value: unknown }> {
  return new Promise((resolve, reject) => {
    const withdraws: Array<() => boolean> = [];
    let settled = false;
    const end = (): void => {
      settled = true;
      for (const withdraw of withdraws) withdraw();
    };
    // A wait can call back at once, in its own call, when its channel has a value or is closed
    try {
      for (let index = 0; index < waits.length && !settled; index++) {
        withdraws.push(
          waits[index]!(
            (value) => {
              if (settled) return;
              end();
              resolve({ index, value });
            },
            (error) => {
              if (settled) return;
              end();
              reject(error);
            },
          ),
        );
      }
    } catch (error) {
      // A wait that throws: the waits before it are withdrawn
      if (!settled) end();
      reject(error);
    }
  });
}

/**
 * Selects from multiple channels (like Go's select statement).
 *
 * Waits for the first channel to have a value available,
 * then calls its handler and returns the result.
 *
 * The first case with a value at once wins. The cases that lose keep no receive: a value that
 * comes later stays in its channel for the next receiver. When the channel of a case is closed
 * and empty, the returned promise rejects.
 *
 * @example
 * const result = await select(
 *   ch1.case((v) => `ch1: ${v}`),
 *   ch2.case((v) => `ch2: ${v}`),
 *   timeout(1000).case(() => 'timeout')
 * )
 */
export async function select<R>(...cases: SelectCase<R>[]): Promise<R> {
  const { index, value } = await firstOf(
    cases.map((c): Wait => c.wait ?? ((onValue, onClosed) => c.channel.waitReceive(onValue, onClosed))),
  );
  // The handler runs after the race, not in the call of the sender
  return cases[index]!.handler(value);
}

/**
 * Creates a timeout channel that sends after the specified duration.
 *
 * @example
 * const result = await select(
 *   dataChannel.case((v) => v),
 *   timeout(5000).case(() => 'timeout!')
 * )
 */
export function timeout(ms: number): Channel<void> {
  const ch = new Channel<void>();
  setTimeout(() => {
    ch.send(undefined).catch(() => {}); // Ignore if closed
    ch.close();
  }, ms);
  return ch;
}

/**
 * Creates a ticker channel that sends at regular intervals.
 *
 * @example
 * const tick = ticker(1000) // Every second
 * for await (const t of tick) {
 *   console.log('Tick:', t)
 * }
 */
export function ticker(ms: number): Channel<number> & { stop: () => void } {
  const ch = new Channel<number>(1);
  let count = 0;

  const intervalId = setInterval(() => {
    ch.trySend(count++);
  }, ms);

  return Object.assign(ch, {
    stop: () => {
      clearInterval(intervalId);
      ch.close();
    },
  });
}

/**
 * Pipeline: pipes values from input channel through transform to output channel.
 *
 * @example
 * const input = channel<number>()
 * const output = pipeline(input, (x) => x * 2)
 *
 * await input.send(5)
 * const result = await output.receive() // 10
 */
export function pipeline<T, U>(
  input: Channel<T>,
  transform: (value: T) => U | Promise<U>,
  bufferSize: number = 0
): Channel<U> {
  const output = new Channel<U>(bufferSize);

  (async () => {
    for await (const value of input) {
      const transformed = await transform(value);
      await output.send(transformed);
    }
    output.close();
  })();

  return output;
}

/**
 * Fan-out: distributes values from one input channel to multiple output channels.
 *
 * @example
 * const input = channel<number>()
 * const [out1, out2, out3] = fanOut(input, 3)
 *
 * // Each output gets a copy of every input value
 */
export function fanOut<T>(input: Channel<T>, count: number, bufferSize: number = 0): Channel<T>[] {
  const outputs = Array.from({ length: count }, () => new Channel<T>(bufferSize));

  (async () => {
    for await (const value of input) {
      await Promise.all(outputs.map((ch) => ch.send(value)));
    }
    outputs.forEach((ch) => ch.close());
  })();

  return outputs;
}

/**
 * Fan-in: merges multiple input channels into one output channel.
 *
 * @example
 * const ch1 = channel<number>()
 * const ch2 = channel<number>()
 * const merged = fanIn(ch1, ch2)
 *
 * // merged receives values from both ch1 and ch2
 */
export function fanIn<T>(...inputs: Channel<T>[]): Channel<T> {
  const output = new Channel<T>();

  const workers = inputs.map(async (input) => {
    for await (const value of input) {
      await output.send(value);
    }
  });

  Promise.all(workers).then(() => output.close());

  return output;
}

/**
 * Merge: like fanIn but closes output when first input closes.
 *
 * It takes one value at a time, from the inputs in turn, and keeps no receive on an input while
 * it waits for the reader of the output. So each value of each input reaches the output one
 * time, in the order of its input, or stays in its input.
 */
export function merge<T>(...inputs: Channel<T>[]): Channel<T> {
  const output = new Channel<T>();

  (async () => {
    // The input after the input of the last value comes first, so a busy input starves no other
    let start = 0;
    while (true) {
      const order = inputs.map((_, offset) => (start + offset) % inputs.length);
      let next: { index: number; value: unknown };
      try {
        next = await firstOf(order.map((index): Wait => (onValue, onClosed) => inputs[index]!.waitReceive(onValue, onClosed)));
      } catch {
        // An input is closed and empty
        break;
      }
      const index = order[next.index]!;
      start = (index + 1) % inputs.length;
      try {
        await output.send(next.value as T);
      } catch {
        // The reader closed the output
        break;
      }
    }
    output.close();
  })();

  return output;
}

/**
 * Buffered channel with specified capacity.
 */
export function buffered<T>(capacity: number): Channel<T> {
  return new Channel<T>(capacity);
}

/**
 * Unbuffered channel (rendezvous point).
 * Sends block until receiver is ready.
 */
export function unbuffered<T>(): Channel<T> {
  return new Channel<T>(0);
}

/**
 * Factory function to create a channel.
 *
 * @example
 * const ch = channel<number>()
 * const bufferedCh = channel<string>(10)
 */
export function channel<T>(bufferSize: number = 0): Channel<T> {
  return new Channel<T>(bufferSize);
}

/**
 * WorkerPool: distributes work across multiple workers.
 *
 * @example
 * const pool = workerPool(
 *   jobChannel,
 *   async (job) => await processJob(job),
 *   { workers: 4 }
 * )
 *
 * // 4 workers concurrently process jobs from jobChannel
 */
export function workerPool<T, R>(
  jobs: Channel<T>,
  worker: (job: T) => Promise<R>,
  options: { workers: number; bufferSize?: number } = { workers: 1 }
): Channel<R> {
  const results = new Channel<R>(options.bufferSize || 0);
  const { workers: workerCount } = options;

  const workers = Array.from({ length: workerCount }, async () => {
    for await (const job of jobs) {
      try {
        const result = await worker(job);
        await results.send(result);
      } catch (error) {
        console.error("Worker error:", error);
      }
    }
  });

  Promise.all(workers).then(() => results.close());

  return results;
}
