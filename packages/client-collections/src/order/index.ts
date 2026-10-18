/**
 * The order of a list as data (Graph's split, wave 2, W1). Each item keeps a string key, and the list
 * sorts by it. An item that moves between two others gets a key between theirs, so a move writes one
 * item and no other.
 */
export { KEY_DIGITS, keyBetween, keysBetween, keysForDrop, compareKeys, isValidKey, dropIndex, type KeyCheckOptions, type KeyedItem, type Point } from "./rank.js";
