/**
 * One job of the suite `tenant-burst-pool` (roadmap CLI-96). It compares a burst of first loads on pools of 5, 10 and 30 connections.
 * Each connection of a warm pool is idle on the server. So the smallest pool that closes the miss sets the advice to a host.
 */

import { BURST_POOL_CASES } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(BURST_POOL_CASES, "forma", ["store"]);
