/**
 * `@procedures/signaldb`: a `CollectionStorage` over the SignalDB collection of an app (roadmap
 * CLI-23, server stack D9). The collection is the local copy of a `HybridStorage`, and the app keeps
 * its cursors and its reactivity.
 *
 * The package has classes and no procedures, so it has no `./module` or `./register` entry. An
 * import of the package registers nothing.
 */

export { SignalDbStorage } from "./storage.js";
export type { SignalDbCollection, SignalDbStorageOptions } from "./storage.js";
export { VALUE_FIELD, documentCodec } from "./codec.js";
export type { SignalDbItem, SignalDbItemCodec } from "./codec.js";
