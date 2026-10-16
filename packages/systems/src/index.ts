// The root registers nothing: import "<package>/register", or give the module to createRegistry()
export * from "./module.js";
export * from "./types.js";
export { CLIENT_RULES } from "./rules.js";
export { bindingOf, lintTimers } from "./lint.js";
export type { TimerFinding, TimerSettings } from "./lint.js";
export { settingsOf } from "./procedures/systems/timers.js";
