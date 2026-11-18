/**
 * One job of the suite `live-bound` (roadmap CLI-132). It reads the writes of the store with an in-flight bound on the
 * writes of the host against the same store with no bound. The case w10 is a rate that the queue of the collection
 * serves, and the case w100 is a rate over its service rate.
 */

import { STALL_CASES } from "./live-cases.js";
import { runLiveJob } from "./live-job.js";

await runLiveJob(STALL_CASES, "store", ["storebound"]);
