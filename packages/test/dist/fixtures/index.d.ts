/**
 * Test fixtures for the ecosystem
 *
 * Provides factory functions for creating test data.
 */
/**
 * Create a temporary directory for test fixtures
 */
export declare function createTempDir(prefix?: string): Promise<string>;
/**
 * Clean up a temporary directory
 */
export declare function cleanupTempDir(dirPath: string): Promise<void>;
/**
 * Create a minimal package.json fixture
 */
export interface PackageJsonFixture {
    name: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}
export declare function createPackageJson(options: PackageJsonFixture): object;
/**
 * Write a package.json to a directory
 */
export declare function writePackageJson(dirPath: string, options: PackageJsonFixture): Promise<void>;
/**
 * Create a minimal TypeScript source file
 */
export declare function writeTsFile(filePath: string, content: string): Promise<void>;
/**
 * Initialize a git repo in a directory
 */
export declare function initGitRepo(dirPath: string, options?: {
    initialCommit?: boolean;
}): Promise<void>;
//# sourceMappingURL=index.d.ts.map