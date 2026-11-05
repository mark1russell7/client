/**
 * One job of the suite `live`. It compares the store path and the live path on one load.
 */

import { LIVE_CASES } from "./live-cases.js";
import { runLiveJob } from "./live-job.js";

await runLiveJob(LIVE_CASES, "store", "live");
