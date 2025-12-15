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
/**
 * Channel<T> - Bidirectional communication channel.
 *
 * Inspired by Go channels. Provides send/receive operations
 * that can block until the other side is ready.
 */
export declare class Channel<T> {
    private queue;
    private _isClosed;
    constructor(bufferSize?: number);
    /**
     * Sends a value through the channel.
     * Blocks if channel buffer is full.
     *
     * @throws Error if channel is closed
     */
    send(value: T): Promise<void>;
    /**
     * Receives a value from the channel.
     * Blocks if no value is available.
     *
     * @throws Error if channel is closed and empty
     */
    receive(): Promise<T>;
    /**
     * Attempts to send without blocking.
     * Returns false if channel is full.
     */
    trySend(value: T): boolean;
    /**
     * Attempts to receive without blocking.
     * Returns undefined if no value is available.
     */
    tryReceive(): T | undefined;
    /**
     * Closes the channel. No more values can be sent.
     * Receivers can still drain remaining values.
     */
    close(): void;
    get isClosed(): boolean;
    get size(): number;
    /**
     * Creates a select case for this channel.
     * Used with the select() function for multiplexing.
     */
    case<R>(handler: (value: T) => R): SelectCase<R>;
    /**
     * Async iteration over channel values.
     * Stops when channel is closed and empty.
     */
    [Symbol.asyncIterator](): AsyncIterator<T>;
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
export declare function select<R>(...cases: SelectCase<R>[]): Promise<R>;
/**
 * Creates a timeout channel that sends after the specified duration.
 *
 * @example
 * const result = await select(
 *   dataChannel.case((v) => v),
 *   timeout(5000).case(() => 'timeout!')
 * )
 */
export declare function timeout(ms: number): Channel<void>;
/**
 * Creates a ticker channel that sends at regular intervals.
 *
 * @example
 * const tick = ticker(1000) // Every second
 * for await (const t of tick) {
 *   console.log('Tick:', t)
 * }
 */
export declare function ticker(ms: number): Channel<number> & {
    stop: () => void;
};
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
export declare function pipeline<T, U>(input: Channel<T>, transform: (value: T) => U | Promise<U>, bufferSize?: number): Channel<U>;
/**
 * Fan-out: distributes values from one input channel to multiple output channels.
 *
 * @example
 * const input = channel<number>()
 * const [out1, out2, out3] = fanOut(input, 3)
 *
 * // Each output gets a copy of every input value
 */
export declare function fanOut<T>(input: Channel<T>, count: number, bufferSize?: number): Channel<T>[];
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
export declare function fanIn<T>(...inputs: Channel<T>[]): Channel<T>;
/**
 * Merge: like fanIn but closes output when first input closes.
 */
export declare function merge<T>(...inputs: Channel<T>[]): Channel<T>;
/**
 * Buffered channel with specified capacity.
 */
export declare function buffered<T>(capacity: number): Channel<T>;
/**
 * Unbuffered channel (rendezvous point).
 * Sends block until receiver is ready.
 */
export declare function unbuffered<T>(): Channel<T>;
/**
 * Factory function to create a channel.
 *
 * @example
 * const ch = channel<number>()
 * const bufferedCh = channel<string>(10)
 */
export declare function channel<T>(bufferSize?: number): Channel<T>;
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
export declare function workerPool<T, R>(jobs: Channel<T>, worker: (job: T) => Promise<R>, options?: {
    workers: number;
    bufferSize?: number;
}): Channel<R>;
//# sourceMappingURL=channels.d.ts.map