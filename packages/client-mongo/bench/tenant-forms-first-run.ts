/**
 * One job of the suite `tenant-forms-first`: the first loads of the suite `tenant-first` on the store, on its control and on two forms of its numbers (roadmap CLI-96).
 * A form that holds a steady load and not the burst is not the answer for a first load.
 */

import { FIRST_LOAD_CASES, FORM_ARMS } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(FIRST_LOAD_CASES, "store", ["control", ...FORM_ARMS]);
