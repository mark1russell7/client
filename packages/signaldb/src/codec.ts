/**
 * The form of the values in the items of a SignalDB collection (roadmap CLI-23).
 *
 * A `CollectionStorage` keeps any JSON value under a string id. A SignalDB collection keeps objects,
 * and each object has its key in the field `id`. A codec changes a value to an item and back.
 *
 * `documentCodec()` is the default codec:
 * - A document is a plain object whose field `id` is its key. The item is the document itself, so
 *   the cursors and the selectors of the app read the document as it is.
 * - Each other value goes into an envelope: `{ id, __value: value }`. This is a value without the
 *   field `id`, a value with another `id`, an array, `null`, a string, a number or a boolean.
 *
 * An app whose items have another form gives its own codec. For example, an app that keeps the
 * Mongo key `_id` of a document in the field `id` of the item maps the two fields.
 */

/** An item of a SignalDB collection: an object with the key of the entry in its field `id`. */
export interface SignalDbItem {
  readonly id: string;
  readonly [field: string]: unknown;
}

/**
 * The change of a value to an item of the collection and back. `fromItem(toItem(id, value))` must
 * give a value that is equal to `value`.
 */
export interface SignalDbItemCodec<T> {
  /**
   * This function gives the item of a value. The item must be a plain object, and its field `id`
   * must be the id of the entry. The storage gives a copy of the value, so the item can keep it.
   */
  toItem(id: string, value: T): SignalDbItem;
  /**
   * This function gives the value of an item. The item is a copy, so the value can keep it. An item
   * that has no value of this codec throws an error.
   */
  fromItem(item: SignalDbItem): T;
}

/** The field of an envelope that holds a value that is not a document. */
export const VALUE_FIELD = "__value";

/** True for a plain object: not `null`, not an array, and not an instance of a class. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * The default codec. A plain object whose `id` is its key is the item itself. Each other value goes
 * into an envelope with the field `valueField`.
 *
 * - A document does not have the field `valueField`: a value with that field goes into an envelope.
 *   Thus an item with the field is always an envelope, and each value comes back as it was.
 * - The field `valueField` is reserved. An item of the app with that field reads as an envelope.
 *
 * @param valueField - The field of an envelope. The default is `__value`.
 * @returns The codec
 */
export function documentCodec<T>(valueField: string = VALUE_FIELD): SignalDbItemCodec<T> {
  if (typeof valueField !== "string" || valueField === "" || valueField === "id") {
    throw new TypeError(`The field of an envelope must be a text that is not empty and not "id", not ${JSON.stringify(valueField)}`);
  }
  return {
    toItem(id: string, value: T): SignalDbItem {
      if (isPlainObject(value) && value["id"] === id && !Object.hasOwn(value, valueField)) return value as unknown as SignalDbItem;
      return { id, [valueField]: value };
    },
    fromItem(item: SignalDbItem): T {
      return (Object.hasOwn(item, valueField) ? item[valueField] : item) as T;
    },
  };
}
