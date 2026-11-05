/**
 * One job of the suite `gate-many` (roadmap CLI-94): the job of the flip, on the case `many-1` alone.
 * A job has the no-fault arm and the flip at the stated slowdown of the case. So one run reads both.
 */

process.argv.push("--cases", "many-1");
await import("./gate-flip-run.js");
