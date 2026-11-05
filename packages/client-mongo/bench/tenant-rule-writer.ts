/**
 * One writer process of the test of the rule (roadmap CLI-96): `--copy <copy> --me <n> --database <name>`.
 * It writes new ids to the partitions, with a few writes in progress at one time, until its time ends. Then it prints each id that got a reply.
 */

import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { RULE_MS, RULE_PARTITIONS, RULE_WRITES_AT_ONE_TIME, partitionName } from "./tenant-rule-cases.js";

const { values } = parseArgs({ options: { copy: { type: "string" }, me: { type: "string" }, database: { type: "string" } } });
const { copy, me, database } = values;
const url = process.env["MONGO_TEST_URL"];
if (!copy || !me || !database || !url) throw new RangeError("this writer needs --copy, --me, --database and MONGO_TEST_URL");

const { MongoDocumentStorage: Storage } = (await import(`../src/storage/document-storage.${copy}.ts`)) as typeof import("../src/storage/document-storage.js");
const client = await MongoClient.connect(url);
const db = client.db(database);
const stores = Array.from({ length: RULE_PARTITIONS }, (_, index) => new Storage<{ text: string }>({ collection: "docs", partition: partitionName(index), db: () => db, client: () => client }));

const replied: string[] = [];
const errors: Record<string, number> = {};
let next = 0;
const end = performance.now() + RULE_MS;
const loop = async (): Promise<void> => {
  while (performance.now() < end) {
    const number = next++;
    const partition = number % RULE_PARTITIONS;
    const id = `w${me}-${number}`;
    try {
      await stores[partition]!.set(id, { text: "x" });
      replied.push(`${partitionName(partition)}/${id}`);
    } catch (error) {
      const kind = (error instanceof Error ? error.message : String(error)).slice(0, 200);
      errors[kind] = (errors[kind] ?? 0) + 1;
    }
  }
};
await Promise.all(Array.from({ length: RULE_WRITES_AT_ONE_TIME }, loop));
await client.close();
process.stdout.write(`${JSON.stringify({ replied, errors })}\n`, () => process.exit(0));
