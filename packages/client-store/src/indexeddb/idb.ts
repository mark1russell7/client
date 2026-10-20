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
  createObjectStore(name: string, options?: { keyPath?: string; autoIncrement?: boolean }): IdbObjectStoreLike;
  transaction(names: string | string[], mode?: "readonly" | "readwrite"): IdbTransactionLike;
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
  index(name: string): IdbIndexLike;
  createIndex(name: string, keyPath: string, options?: { unique?: boolean }): unknown;
}

/**
 * An index of an object store. The results follow the order of the keys of the index. A record
 * without the key path of the index is not in the index.
 */
export interface IdbIndexLike {
  /** The records, the first `count` of them when `count` is given. */
  getAll(query?: null, count?: number): IdbRequestLike<unknown[]>;
  /** The primary keys of the records, without their values. */
  getAllKeys(query?: null, count?: number): IdbRequestLike<unknown[]>;
  count(): IdbRequestLike<number>;
  /** A cursor over the records. `"prev"` starts at the highest key of the index. */
  openCursor(query?: null, direction?: "next" | "prev"): IdbRequestLike<IdbCursorLike | null>;
}

/** A cursor of an index, with the value of its record. */
export interface IdbCursorLike {
  /** The key of the index. */
  readonly key: unknown;
  readonly value: unknown;
  continue(): void;
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
 * This function calls `then` with the result of the request when the request succeeds. An error of
 * `then` goes to `fail`, which aborts the transaction. Thus a check in a step of a transaction
 * undoes each request of the transaction.
 */
export function onResult<R>(request: IdbRequestLike<R>, fail: (error: unknown) => void, then: (result: R) => void): void {
  request.onsuccess = () => {
    try {
      then(request.result);
    } catch (error) {
      fail(error);
    }
  };
}

/** An object store of a database, with its indexes. */
export interface IdbStoreSchema {
  readonly name: string;
  readonly options?: { keyPath?: string; autoIncrement?: boolean };
  readonly indexes?: ReadonlyArray<{ readonly name: string; readonly keyPath: string; readonly unique?: boolean }>;
}

/**
 * The work of one transaction. It makes the requests, and it gives a function that reads their
 * results after the commit. `fail` aborts the transaction: the promise of the transaction then
 * rejects with the error of `fail`, and each request is undone.
 */
export type IdbWork<R> = (transaction: IdbTransactionLike, fail: (error: unknown) => void) => () => R;

/**
 * One database, version 1, with its object stores. The connection opens at the first operation,
 * and a failed open tries again at the next operation.
 */
export class IdbConnection {
  private connection: Promise<IdbDatabaseLike> | undefined;
  private closed = false;

  constructor(
    /** The name of the database. */
    readonly database: string,
    /** The object stores of the database. */
    private readonly stores: readonly IdbStoreSchema[],
    private readonly factory: IdbFactoryLike | undefined,
    /** The function that writes the first records when the open makes the object stores. */
    private readonly onCreate?: (store: (name: string) => IdbObjectStoreLike) => void,
  ) {}

  /**
   * This method runs work in one transaction over the object stores of `names`. The promise resolves
   * after the transaction commits, so a write is durable when the promise resolves. An error of a
   * request, a throw of the work and a call of `fail` abort the transaction: each request is undone.
   */
  async transaction<R>(mode: "readonly" | "readwrite", names: readonly string[], work: IdbWork<R>): Promise<R> {
    const db = await this.open();
    return new Promise<R>((resolve, reject) => {
      let transaction: IdbTransactionLike | undefined;
      let failure: { readonly error: unknown } | undefined;
      const abort = (): void => {
        try {
          transaction?.abort();
        } catch {
          // The transaction ended already
        }
      };
      const fail = (error: unknown): void => {
        if (failure) return;
        failure = { error };
        abort();
        reject(error);
      };
      let read: () => R;
      try {
        transaction = db.transaction(names.length === 1 ? names[0]! : [...names], mode);
        read = work(transaction, fail);
      } catch (error) {
        // A request that the work made before the throw does not commit
        fail(error);
        return;
      }
      const current = transaction;
      current.oncomplete = () => {
        try {
          resolve(read());
        } catch (error) {
          reject(error);
        }
      };
      current.onerror = (event?: { target?: { error?: unknown } }) =>
        reject(failure ? failure.error : errorOf(event?.target?.error ?? current.error, `The IndexedDB transaction on ${this.database} failed`));
      current.onabort = () => reject(failure ? failure.error : errorOf(current.error, `The IndexedDB transaction on ${this.database} was aborted`));
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
        const created = new Map<string, IdbObjectStoreLike>();
        for (const schema of this.stores) {
          if (db.objectStoreNames.contains(schema.name)) continue;
          const store = db.createObjectStore(schema.name, schema.options ?? {});
          for (const index of schema.indexes ?? []) store.createIndex(index.name, index.keyPath, { unique: index.unique ?? false });
          created.set(schema.name, store);
        }
        if (this.onCreate && created.size > 0) {
          this.onCreate((name) => {
            const store = created.get(name);
            if (!store) throw new Error(`The object store ${name} of ${this.database} existed before the open`);
            return store;
          });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const missing = this.stores.find((schema) => !db.objectStoreNames.contains(schema.name));
        if (missing) {
          db.close();
          reject(new Error(`The IndexedDB database ${this.database} exists, and it has no object store ${missing.name}`));
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

/** One object store in its own database, version 1. The stores of programs, queues and sync states use it. */
export class IdbStoreConnection {
  private readonly connection: IdbConnection;

  constructor(
    /** The name of the database. */
    readonly database: string,
    /** The name of the object store. */
    readonly store: string,
    storeOptions: { keyPath?: string; autoIncrement?: boolean },
    factory: IdbFactoryLike | undefined,
  ) {
    this.connection = new IdbConnection(database, [{ name: store, options: storeOptions }], factory);
  }

  /**
   * This method runs work in one transaction. The work makes the requests, and it gives a function that reads
   * their results. The promise resolves after the transaction commits, so a write is durable when
   * the promise resolves. An error of a request aborts the transaction: each request is undone.
   */
  run<R>(mode: "readonly" | "readwrite", work: (store: IdbObjectStoreLike) => () => R): Promise<R> {
    return this.connection.transaction(mode, [this.store], (transaction) => work(transaction.objectStore(this.store)));
  }

  /** This method closes the connection. A later operation throws. */
  close(): Promise<void> {
    return this.connection.close();
  }
}
