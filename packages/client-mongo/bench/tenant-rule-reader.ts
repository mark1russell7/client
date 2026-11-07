/**
 * The reader process of the test of the rule (roadmap CLI-96): `--copy <copy> --database <name>`.
 * It reads the changes of each partition again and again, from the version of its last read, as a client of the store does.
 * A line on its stdin ends the reads: it then reads each partition two more times and prints each id that it saw.
 */

import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { RULE_PARTITIONS, partitionName } from "./tenant-rule-cases.js";

const { values } = parseArgs({ options: { copy: { type: "string" }, database: { type: "string" } } });
const { copy, database } = values;
const url = process.env["MONGO_TEST_URL"];
if (!copy || !database || !url) throw new RangeError("this reader needs --copy, --database and MONGO_TEST_URL");

const { MongoDocumentStorage: Storage } = (await import(`../src/storage/document-storage.${copy}.ts`)) as typeof import("../src/storage/document-storage.js");
const client = await MongoClient.connect(url);
const db = client.db(database);
const stores = Array.from({ length: RULE_PARTITIONS }, (_, index) => new Storage<{ text: string }>({ collection: "docs", partition: partitionName(index), db: () => db, client: () => client }));

const versions: (string | undefined)[] = stores.map(() => undefined);
const seen = new Set<string>();
let deltas = 0;
let laterFulls = 0;

const readAll = async (): Promise<void> => {
  for (const [index, store] of stores.entries()) {
    const since = versions[index];
    const changes = await store.getChangesSince(since);
    if (changes.full && since !== undefined) laterFulls++;
    if (!changes.full) deltas++;
    for (const [id] of changes.changed) seen.add(`${partitionName(index)}/${id}`);
    versions[index] = changes.version;
  }
};

let ending = false;
const lines = createInterface({ input: process.stdin });
lines.once("line", () => {
  ending = true;
  lines.close();
});
while (!ending) {
  await readAll();
  await new Promise((resolve) => setImmediate(resolve));
}
await readAll();
await readAll();
await client.close();
process.stdout.write(`${JSON.stringify({ seen: [...seen], deltas, laterFulls })}\n`, () => process.exit(0));
