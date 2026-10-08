/**
 * git.checkout procedure
 *
 * Checkout branch or files
 */
import { execFileSync } from "node:child_process";
/**
 * Checkout branch or files
 */
export async function gitCheckout(input) {
    const { ref, create, paths, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    const args = ["checkout"];
    if (create)
        args.push("-b");
    args.push(ref);
    if (paths && paths.length > 0) {
        args.push("--", ...paths);
    }
    execFileSync("git", args, opts);
    return { ref, created: create };
}
//# sourceMappingURL=checkout.js.map