/**
 * One job of the suite `tenant-separate`. It writes the copies of the store of `tenant-copies.ts` next to the source,
 * and runs each copy beside the store.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { SEPARATE_ARMS, SEPARATE_CASES } from "./tenant-cases.js";
import { copiesOf } from "./tenant-copies.js";
import { runTenantJob } from "./tenant-job.js";

const copies = copiesOf(readFileSync(new URL("../src/storage/document-storage.ts", import.meta.url), "utf8"));
for (const arm of SEPARATE_ARMS) writeFileSync(new URL(`../src/storage/document-storage.${arm}.ts`, import.meta.url), copies[arm]);

await runTenantJob(SEPARATE_CASES, "store", SEPARATE_ARMS);
