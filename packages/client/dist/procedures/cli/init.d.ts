/**
 * Library Initialization
 *
 * Scaffolds a new library with procedure support.
 * Creates the necessary file structure and configuration.
 */
export interface InitOptions {
    /** Library name or "." for current directory */
    name: string;
    /** Overwrite existing files */
    force: boolean;
}
/**
 * Initialize a new library with procedure support.
 */
export declare function init(options: InitOptions): Promise<void>;
//# sourceMappingURL=init.d.ts.map