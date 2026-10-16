/**
 * The part of IndexedDB that the stores of `@procedures/store/indexeddb` use (roadmap R45).
 *
 * The package compiles without the DOM types, so this module declares the shapes that it uses.
 * The `indexedDB` of a browser fits them, and the `IDBFactory` of `fake-indexeddb` too. Nothing in
 * this module reads a global value when it loads: Node can import it.
 */

// The event handlers take `any`: the DOM handlers take their own event types, and a parameter of
// the type `unknown` does not accept them.

/** A request of IndexedDB. */
export interface IdbRequestLike<R = unknown> {
  readonly result: R;
  readonly error: unknown;
  onsuccess: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
}

/** The request that opens a database. */
export interface IdbOpenRequestLike extends IdbRequestLike<IdbDatabaseLike> {
  onupgradeneeded: ((event: any) => void) | null;
}

/** The factory of the databases: `indexedDB` in a browser. */
export interface IdbFactoryLike {
  open(name: string, version?: number): IdbOpenRequestLike;
}

/** An open database. */
export interface IdbDatabaseLike {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options?: { keyPath?: string; autoIncrement?: boolean }): unknown;
  transaction(names: string, mode?: "readonly" | "readwrite"): IdbTransactionLike;
  close(): void;
  onversionchange: ((event: any) => void) | null;
}

/** A transaction. */
export interface IdbTransactionLike {
  readonly error: unknown;
  objectStore(name: string): IdbObjectStoreLike;
  abort(): void;
  oncomplete: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onabort: ((event: any) => void) | null;
}

/** An object store in a transaction. */
export interface IdbObjectStoreLike {
  get(key: string): IdbRequestLike<unknown>;
  getAll(): IdbRequestLike<unknown[]>;
  count(key?: string): IdbRequestLike<number>;
  put(value: unknown, key?: string): IdbRequestLike<unknown>;
  add(value: unknown, key?: string): IdbRequestLike<unknown>;
  delete(key: string): IdbRequestLike<unknown>;
  clear(): IdbRequestLike<unknown>;
}

/** The options of the IndexedDB stores. */
export interface IndexedDbOptions {
  /**
   * The factory of the databases. The tests give the one of `fake-indexeddb`.
   * @default the `indexedDB` of the global scope
   */
  indexedDB?: IdbFactoryLike;
}

/** The `indexedDB` of the global scope, or undefined (Node, an old browser, some private windows). */
function globalFactory(): IdbFactoryLike | undefined {
  return (globalThis as { indexedDB?: IdbFactoryLike }).indexedDB ?? undefined;
}

/**
 * This function gives true when the global scope has IndexedDB. A browser can still refuse to open a database,
 * for example in some private windows: the first operation of a store then fails.
 */
export function hasIndexedDb(): boolean {
  return globalFactory() !== undefined;
}

/** The error of a request or a transaction, as an `Error`. */
function errorOf(cause: unknown, message: string): Error {
  return cause instanceof Error ? cause : new Error(message, { cause });
}

/**
 * One object store in its own database, version 1. The connection opens at the first operation,
 * and a failed open tries again at the next operation.
 */
export class IdbStoreConnection {
  private connection: Promise<IdbDatabaseLike> | undefined;
  private closed = false;

  constructor(
    /** The name of the database. */
    readonly database: string,
    /** The name of the object store. */
    readonly store: string,
    private readonly storeOptions: { keyPath?: string; autoIncrement?: boolean },
    private readonly factory: IdbFactoryLike | undefined,
  ) {}

  /**
   * This method runs work in one transaction. The work makes the requests, and it gives a function that reads
   * their results. The promise resolves after the transaction commits, so a write is durable when
   * the promise resolves. An error of a request aborts the transaction: each request is undone.
   */
  async run<R>(mode: "readonly" | "readwrite", work: (store: IdbObjectStoreLike) => () => R): Promise<R> {
    const db = await this.open();
    return new Promise<R>((resolve, reject) => {
      let transaction: IdbTransactionLike;
      let read: () => R;
      try {
        transaction = db.transaction(this.store, mode);
        read = work(transaction.objectStore(this.store));
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        try {
          resolve(read());
        } catch (error) {
          reject(error);
        }
      };
      transaction.onerror = () => reject(errorOf(transaction.error, `The IndexedDB transaction on ${this.database} failed`));
      transaction.onabort = () => reject(errorOf(transaction.error, `The IndexedDB transaction on ${this.database} was aborted`));
    });
  }

  /** This method closes the connection. A later operation throws. */
  async close(): Promise<void> {
    this.closed = true;
    const connection = this.connection;
    this.connection = undefined;
    if (!connection) return;
    try {
      (await connection).close();
    } catch {
      // The open failed: there is nothing to close
    }
  }

  private open(): Promise<IdbDatabaseLike> {
    if (this.closed) return Promise.reject(new Error(`The IndexedDB store ${this.database} is closed`));
    if (!this.connection) {
      const connection = this.connect();
      this.connection = connection;
      connection.catch(() => {
        if (this.connection === connection) this.connection = undefined;
      });
    }
    return this.connection;
  }

  private connect(): Promise<IdbDatabaseLike> {
    const factory = this.factory ?? globalFactory();
    if (!factory) return Promise.reject(new Error("IndexedDB is not available in this environment"));
    return new Promise<IdbDatabaseLike>((resolve, reject) => {
      let request: IdbOpenRequestLike;
      try {
        request = factory.open(this.database, 1);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.store)) db.createObjectStore(this.store, this.storeOptions);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.store)) {
          db.close();
          reject(new Error(`The IndexedDB database ${this.database} exists, and it has no object store ${this.store}`));
          return;
        }
        // Another tab wants a new version: close this connection, so the upgrade can run
        db.onversionchange = () => {
          db.close();
          this.connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(errorOf(request.error, `IndexedDB could not open the database ${this.database}`));
    });
  }
}
