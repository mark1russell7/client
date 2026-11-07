/**
 * One job of the suite `tenant-burst` (roadmap CLI-96). It reads what fills the event loop of a writer in the second of a burst of first loads.
 * Each writer records its processor share, the delay of its event loop and the state of its pool.
 * It records them in that second and in a second before the burst.
 */

import { BURST_PROBE_CASES } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(BURST_PROBE_CASES, "store", ["control", "forma", "formb", "formbbound"]);
