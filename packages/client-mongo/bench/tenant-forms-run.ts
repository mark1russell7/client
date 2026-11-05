/**
 * One job of the suite `tenant-forms`: the load of the suite `tenant` on the store, on its control and on two forms of its numbers (roadmap CLI-96).
 */

import { FORM_ARMS, FORM_CASES } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(FORM_CASES, "store", ["control", ...FORM_ARMS]);
