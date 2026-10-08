/**
 * Git predicate procedures
 *
 * Simple boolean predicates for conditional execution.
 * These return true/false based on git repository state.
 */
export interface GitPredicateInput {
    /** Working directory (default: process.cwd()) */
    cwd?: string | undefined;
}
export interface GitPredicateOutput {
    /** The predicate result */
    value: boolean;
}
/**
 * Check if there are any changes (unstaged, staged, or untracked)
 */
export declare function gitHasChanges(input: GitPredicateInput): Promise<GitPredicateOutput>;
/**
 * Check if there are any staged changes ready to commit
 */
export declare function gitHasStagedChanges(input: GitPredicateInput): Promise<GitPredicateOutput>;
/**
 * Check if there are any unstaged changes (modified or deleted files)
 */
export declare function gitHasUnstagedChanges(input: GitPredicateInput): Promise<GitPredicateOutput>;
/**
 * Check if there are any untracked files
 */
export declare function gitHasUntrackedFiles(input: GitPredicateInput): Promise<GitPredicateOutput>;
/**
 * Check if there are local commits that haven't been pushed
 */
export declare function gitHasLocalCommits(input: GitPredicateInput): Promise<GitPredicateOutput>;
/**
 * Check if the working directory is clean (no changes at all)
 */
export declare function gitIsClean(input: GitPredicateInput): Promise<GitPredicateOutput>;
//# sourceMappingURL=predicates.d.ts.map