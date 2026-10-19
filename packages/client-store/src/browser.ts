/**
 * The entry `@procedures/store/browser`: the storages of the store that run in a browser
 * (roadmap CLI-19).
 *
 * - `HybridStorage` keeps a local copy in front of a remote storage, with its errors and its types.
 * - `ApiStorage` is the remote storage over the collection procedures of a server.
 * - `EventsChangeFeed` pushes the remote changes to a `HybridStorage`.
 * - The entry also has all of `@procedures/store/indexeddb`: the IndexedDB stores and their
 *   fallbacks in memory.
 *
 * No module of this entry imports a module of Node, directly or through another module. The
 * modules import `@procedures/client/browser` and not the root of the client, because the root
 * imports `http` and `ws`. `browser.test.ts` examines the imports.
 *
 * This entry does not have `FileProgramStore` or `FileQueueStore`, because they use `node:fs`.
 * An import of this entry registers nothing.
 */

export * from "./indexeddb.js";
export {
  HybridStorage,
  PendingWriteError,
  QueueFullError,
  MissingKeysError,
  QueueStoreError,
  ConflictError,
  ModeSwitchError,
  SyncStateError,
} from "./storage/hybrid.js";
export type { HybridStorageOptions, HybridMode, LocalCopyStorage } from "./storage/hybrid.js";
export type { ConflictResolution, SyncError, SyncStatus } from "./storage/types.js";
export { ApiStorage } from "./storage/api.js";
export type { ApiStorageOptions } from "./storage/api.js";
export { EventsChangeFeed } from "./storage/feed.js";
export type {
  ChangeEventSource,
  EventSubscriber,
  EventsChangeFeedOptions,
  RemoteChangeFeed,
  RemoteChangeHint,
  RemoteChangeListener,
  RemoteChanges,
} from "./storage/feed.js";
