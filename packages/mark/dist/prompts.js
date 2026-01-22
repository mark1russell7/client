/**
 * Interactive Prompts
 *
 * Wraps @clack/prompts for beautiful, modern CLI prompts.
 * Used by Vite, Astro, and other modern tools.
 */
import * as p from "@clack/prompts";
import chalk from "chalk";
/**
 * Text input prompt
 */
function text(message, options) {
    const opts = { message };
    if (options?.placeholder !== undefined)
        opts.placeholder = options.placeholder;
    if (options?.defaultValue !== undefined)
        opts.defaultValue = options.defaultValue;
    return p.text(opts);
}
/**
 * Yes/No confirmation prompt
 */
function confirm(message, options) {
    const opts = { message };
    if (options?.initialValue !== undefined)
        opts.initialValue = options.initialValue;
    return p.confirm(opts);
}
/**
 * Single select prompt
 */
function select(message, options) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return p.select({ message, options });
}
/**
 * Multi-select prompt
 */
function multiselect(message, options) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return p.multiselect({ message, options });
}
/**
 * Password/hidden input prompt
 */
function password(message) {
    return p.password({ message });
}
/**
 * Intro banner
 */
function intro(msg) {
    p.intro(chalk.bgCyan.black(` ${msg} `));
}
/**
 * Outro banner
 */
function outro(msg) {
    p.outro(chalk.green(msg));
}
/**
 * Spinner for async operations
 */
function spinner() {
    return p.spinner();
}
/**
 * Cancel operation
 */
function cancel(msg) {
    p.cancel(msg ?? "Operation cancelled");
}
/**
 * Note/info box
 */
function note(message, title) {
    p.note(message, title);
}
/**
 * Log message within prompt flow
 */
const log = {
    info: (msg) => {
        p.log.info(msg);
    },
    success: (msg) => {
        p.log.success(msg);
    },
    warn: (msg) => {
        p.log.warn(msg);
    },
    error: (msg) => {
        p.log.error(msg);
    },
    message: (msg) => {
        p.log.message(msg);
    },
    step: (msg) => {
        p.log.step(msg);
    },
};
/**
 * Prompt utilities
 */
export const prompts = {
    text: text,
    confirm: confirm,
    select: select,
    multiselect: multiselect,
    password: password,
    group: p.group,
    intro: intro,
    outro: outro,
    spinner: spinner,
    log: log,
    isCancel: p.isCancel,
    cancel: cancel,
    note: note,
};
/**
 * Re-export for direct access
 */
export { p as clack };
//# sourceMappingURL=prompts.js.map