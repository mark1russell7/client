/**
 * glob procedure
 *
 * Find files matching glob pattern
 */
import { glob as nodeGlob } from "node:fs/promises";
/**
 * Find files matching glob pattern
 */
export async function glob(input) {
    const { pattern, cwd, absolute, dot } = input;
    const options = {};
    if (cwd)
        options.cwd = cwd;
    if (absolute)
        options.absolute = absolute;
    if (dot)
        options.dot = dot;
    const matches = [];
    for await (const match of nodeGlob(pattern, options)) {
        matches.push(match);
    }
    return { pattern, matches };
}
//# sourceMappingURL=glob.js.map