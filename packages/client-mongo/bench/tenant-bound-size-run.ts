/**
 * One job of the suite `tenant-bound-size` (roadmap CLI-96). It compares three sizes of the bound on the calls in progress of form B: 8, 16 and 32.
 * The value 16 was set by hand. This suite reads the rate and the tail of a smaller and of a larger value.
 */

import { BOUND_SIZE_CASES } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(BOUND_SIZE_CASES, "formbbound", ["formbbound8", "formbbound32"]);
