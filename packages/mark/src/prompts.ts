/**
 * Interactive Prompts
 *
 * Wraps @clack/prompts for beautiful, modern CLI prompts.
 * Used by Vite, Astro, and other modern tools.
 */

import * as p from "@clack/prompts";
import chalk from "chalk";

// Types
type TextResult = Promise<string | symbol>;
type ConfirmResult = Promise<boolean | symbol>;
type SelectResult<T> = Promise<T | symbol>;
type MultiselectResult<T> = Promise<T[] | symbol>;
type PasswordResult = Promise<string | symbol>;
type SpinnerInstance = ReturnType<typeof p.spinner>;

/** Prompts interface for type annotation */
export interface Prompts {
  text: (message: string, options?: { placeholder?: string; defaultValue?: string }) => TextResult;
  confirm: (message: string, options?: { initialValue?: boolean }) => ConfirmResult;
  select: <T extends string>(
    message: string,
    options: Array<{ value: T; label: string; hint?: string }>
  ) => SelectResult<T>;
  multiselect: <T extends string>(
    message: string,
    options: Array<{ value: T; label: string; hint?: string }>
  ) => MultiselectResult<T>;
  password: (message: string) => PasswordResult;
  group: typeof p.group;
  intro: (msg: string) => void;
  outro: (msg: string) => void;
  spinner: () => SpinnerInstance;
  log: {
    info: (msg: string) => void;
    success: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    message: (msg: string) => void;
    step: (msg: string) => void;
  };
  isCancel: typeof p.isCancel;
  cancel: (msg?: string) => void;
  note: (message: string, title?: string) => void;
}

/**
 * Text input prompt
 */
function text(
  message: string,
  options?: { placeholder?: string; defaultValue?: string }
): TextResult {
  const opts: Parameters<typeof p.text>[0] = { message };
  if (options?.placeholder !== undefined) opts.placeholder = options.placeholder;
  if (options?.defaultValue !== undefined) opts.defaultValue = options.defaultValue;
  return p.text(opts);
}

/**
 * Yes/No confirmation prompt
 */
function confirm(message: string, options?: { initialValue?: boolean }): ConfirmResult {
  const opts: Parameters<typeof p.confirm>[0] = { message };
  if (options?.initialValue !== undefined) opts.initialValue = options.initialValue;
  return p.confirm(opts);
}

/**
 * Single select prompt
 */
function select<T extends string>(
  message: string,
  options: Array<{ value: T; label: string; hint?: string }>
): SelectResult<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return p.select({ message, options } as any) as SelectResult<T>;
}

/**
 * Multi-select prompt
 */
function multiselect<T extends string>(
  message: string,
  options: Array<{ value: T; label: string; hint?: string }>
): MultiselectResult<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return p.multiselect({ message, options } as any) as MultiselectResult<T>;
}

/**
 * Password/hidden input prompt
 */
function password(message: string): PasswordResult {
  return p.password({ message });
}

/**
 * Intro banner
 */
function intro(msg: string): void {
  p.intro(chalk.bgCyan.black(` ${msg} `));
}

/**
 * Outro banner
 */
function outro(msg: string): void {
  p.outro(chalk.green(msg));
}

/**
 * Spinner for async operations
 */
function spinner(): SpinnerInstance {
  return p.spinner();
}

/**
 * Cancel operation
 */
function cancel(msg?: string): void {
  p.cancel(msg ?? "Operation cancelled");
}

/**
 * Note/info box
 */
function note(message: string, title?: string): void {
  p.note(message, title);
}

/**
 * Log message within prompt flow
 */
const log = {
  info: (msg: string): void => {
    p.log.info(msg);
  },
  success: (msg: string): void => {
    p.log.success(msg);
  },
  warn: (msg: string): void => {
    p.log.warn(msg);
  },
  error: (msg: string): void => {
    p.log.error(msg);
  },
  message: (msg: string): void => {
    p.log.message(msg);
  },
  step: (msg: string): void => {
    p.log.step(msg);
  },
};

/**
 * Prompt utilities
 */
export const prompts: Prompts = {
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
