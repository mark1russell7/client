/**
 * One job of the suite `live-stall` (roadmap CLI-102). It reads the replies of the store with a subscriber and with no subscriber.
 * The arm with no subscriber is the copy with no fault. Its replies give the service rate of the collection.
 */

import { STALL_CASES } from "./live-cases.js";
import { runLiveJob } from "./live-job.js";

await runLiveJob(STALL_CASES, "storequiet", "store");
