/**
 * One job of the suite `tenant-partition`, the gate of roadmap CLI-96: the store with a counter and a write queue for
 * each partition, beside the control of 100 collections, at the rungs of 800 and 8,000 writes a second.
 */

import { PARTITION_CASES } from "./tenant-cases.js";
import { runTenantJob } from "./tenant-job.js";

await runTenantJob(PARTITION_CASES, "control", ["partition"]);
