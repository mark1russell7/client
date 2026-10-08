/**
 * @mark1russell7/mock-fs
 */
export interface MockFsEntry {
    type: "file" | "directory";
    content?: string | undefined;
    mtime: Date;
}
export interface MockFs {
    files: Map<string, MockFsEntry>;
    readFile(p: string): string;
    writeFile(p: string, content: string): void;
    exists(p: string): boolean;
    unlink(p: string): void;
    mkdir(p: string, opts?: {
        recursive?: boolean;
    }): void;
    readdir(p: string): string[];
    reset(): void;
}
export interface CreateMockFsOptions {
    initialFiles?: Record<string, string> | undefined;
    initialDirs?: string[] | undefined;
}
export declare function createMockFs(options?: CreateMockFsOptions): MockFs;
//# sourceMappingURL=index.d.ts.map