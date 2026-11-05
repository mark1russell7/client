/**
 * One job of the suite `gate-part` (roadmap CLI-94): the job of the flip, on the case `part-1` alone.
 * A job has the no-fault arm and the flip at the stated slowdown of the case. So one run reads both.
 */

process.argv.push("--cases", "part-1");
await import("./gate-flip-run.js");
