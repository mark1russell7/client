/**
 * A second process for a test of the change log (roadmap CLI-93): `<url> <database> <collection> <id>`.
 * This process deletes one item with a limit of one tombstone, so its write prunes the older tombstones.
 */

import { MongoClient } from "mongodb";
import { MongoDocumentStorage } from "../src/storage/document-storage.js";

const [url, database, collection, id] = process.argv.slice(2);
if (url === undefined || database === undefined || collection === undefined || id === undefined) throw new RangeError("this process needs <url> <database> <collection> <id>");

const client = new MongoClient(url);
await client.connect();
const db = client.db(database);
const storage = new MongoDocumentStorage<{ n: number }>({ collection, db: () => db, transactions: "never", maxTombstones: 1 });
await storage.delete(id);
await client.close();
