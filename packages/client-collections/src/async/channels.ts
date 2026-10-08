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
    this.queue = asyncQueue<T>({ capacity: bufferSize || 1 });
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
}

/**
 * Selects from multiple channels (like Go's select statement).
 *
 * Waits for the first channel to have a value available,
 * then calls its handler and returns the result.
 *
 * @example
 * const result = await select(
 *   ch1.case((v) => `ch1: ${v}`),
 *   ch2.case((v) => `ch2: ${v}`),
 *   timeout(1000).case(() => 'timeout')
 * )
 */
export async function select<R>(...cases: SelectCase<R>[]): Promise<R> {
  // First, try non-blocking receive on all channels
  for (const c of cases) {
    const value = c.tryReceive();
    if (value !== undefined) {
      return c.handler(value);
    }
  }

  // If no immediate value, race all receive operations
  const promises = cases.map((c, index) =>
    c.receive().then((value) => ({ index, value }))
  );

  const { index, value } = await Promise.race(promises);
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
 */
export function merge<T>(...inputs: Channel<T>[]): Channel<T> {
  const output = new Channel<T>();

  (async () => {
    const iterators = inputs.map((ch) => ch[Symbol.asyncIterator]());

    while (true) {
      const results = await Promise.race(
        iterators.map(async (it, idx) => {
          const result = await it.next();
          return { idx, result };
        })
      );

      if (results.result.done) {
        output.close();
        break;
      }

      await output.send(results.result.value);
    }
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
