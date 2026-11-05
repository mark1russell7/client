/**
 * A second process for a test of the change log (roadmap CLI-93): `<url> <database> <collection> <id> [hold]`.
 * This process deletes one item with a limit of one tombstone, so its write prunes the older tombstones.
 * With `hold`, the prune stops before the second of its two steps. The process then prints the name of
 * the first step, and it continues when a line arrives on its input.
 */

import { once } from "node:events";
import { MongoClient, type Db, type Document } from "mongodb";
import { MongoDocumentStorage } from "../src/storage/document-storage.js";

const [url, database, collection, id, hold] = process.argv.slice(2);
if (url === undefined || database === undefined || collection === undefined || id === undefined) throw new RangeError("this process needs <url> <database> <collection> <id>");

const client = new MongoClient(url);
await client.connect();
const db = client.db(database);

let first: string | undefined;

/** This function stops the second step of the prune until a line arrives. */
async function step(name: string): Promise<void> {
  if (first === undefined) {
    first = name;
    return;
  }
  process.stdout.write(`${first}\n`);
  await once(process.stdin, "data");
}

/** This database goes through `step` before the raise of the floor and before the delete of the tombstones. */
const holding = new Proxy(db, {
  get(target, key) {
    if (key !== "collection") {
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
    return (name: string) => {
      const items = target.collection(name);
      const updateOne = items.updateOne.bind(items) as (...args: unknown[]) => Promise<unknown>;
      const deleteMany = items.deleteMany.bind(items) as (...args: unknown[]) => Promise<unknown>;
      return Object.assign(items, {
        updateOne: async (filter: unknown, update: Document, ...rest: unknown[]) => {
          if (update["$max"] !== undefined) await step("floor");
          return updateOne(filter, update, ...rest);
        },
        deleteMany: async (...args: unknown[]) => {
          if (name === collection) await step("delete");
          return deleteMany(...args);
        },
      });
    };
  },
}) as Db;

const storage = new MongoDocumentStorage<{ n: number }>({ collection, db: () => (hold === "hold" ? holding : db), transactions: "never", maxTombstones: 1 });
await storage.delete(id);
await client.close();
process.exit(0);
