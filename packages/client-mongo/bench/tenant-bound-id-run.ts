/**
 * One job of the suite `tenant-bound-id` (roadmap CLI-96). It compares the bound with a rule of each id to the bound with no rule.
 * The cases read the cost of the rule on different ids, and what the rule does to writes of one id.
 */

import { BOUND_ID_CASES } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(BOUND_ID_CASES, "formbbound", ["formbboundid"]);
