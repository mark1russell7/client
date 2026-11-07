/**
 * One job of the suite `tenant-bound` (roadmap CLI-96). It compares form B with no bound on its calls in progress and form B with a bound.
 * Each child samples the numbers in progress in the counter document, so the record reads the cost of that list.
 */

import { BOUND_CASES } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(BOUND_CASES, "formbbound", ["formb"]);
