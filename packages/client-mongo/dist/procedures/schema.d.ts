/**
 * Minimal Schema Helpers
 *
 * Zod-like interface for the client procedure system.
 * No actual validation - just type passthrough.
 */
interface ZodErrorLike {
    message: string;
    errors: Array<{
        path: (string | number)[];
        message: string;
    }>;
}
interface ZodLikeSchema<T> {
    parse(data: unknown): T;
    safeParse(data: unknown): {
        success: true;
        data: T;
    } | {
        success: false;
        error: ZodErrorLike;
    };
    _output: T;
}
/**
 * Create a pass-through schema for type T
 */
export declare function schema<T>(): ZodLikeSchema<T>;
export {};
//# sourceMappingURL=schema.d.ts.map