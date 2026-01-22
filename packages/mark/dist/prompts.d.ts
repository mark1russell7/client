/**
 * Interactive Prompts
 *
 * Wraps @clack/prompts for beautiful, modern CLI prompts.
 * Used by Vite, Astro, and other modern tools.
 */
import * as p from "@clack/prompts";
type TextResult = Promise<string | symbol>;
type ConfirmResult = Promise<boolean | symbol>;
type SelectResult<T> = Promise<T | symbol>;
type MultiselectResult<T> = Promise<T[] | symbol>;
type PasswordResult = Promise<string | symbol>;
type SpinnerInstance = ReturnType<typeof p.spinner>;
/** Prompts interface for type annotation */
export interface Prompts {
    text: (message: string, options?: {
        placeholder?: string;
        defaultValue?: string;
    }) => TextResult;
    confirm: (message: string, options?: {
        initialValue?: boolean;
    }) => ConfirmResult;
    select: <T extends string>(message: string, options: Array<{
        value: T;
        label: string;
        hint?: string;
    }>) => SelectResult<T>;
    multiselect: <T extends string>(message: string, options: Array<{
        value: T;
        label: string;
        hint?: string;
    }>) => MultiselectResult<T>;
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
 * Prompt utilities
 */
export declare const prompts: Prompts;
/**
 * Re-export for direct access
 */
export { p as clack };
//# sourceMappingURL=prompts.d.ts.map