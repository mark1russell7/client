/**
 * git.checkout procedure
 *
 * Checkout branch or files
 */
import { execSync } from "node:child_process";
/**
 * Checkout branch or files
 */
export async function gitCheckout(input) {
    const { ref, create, paths, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    const args = ["git", "checkout"];
    if (create)
        args.push("-b");
    args.push(ref);
    if (paths && paths.length > 0) {
        args.push("--", ...paths.map(p => `"${p}"`));
    }
    execSync(args.join(" "), opts);
    return { ref, created: create };
}
//# sourceMappingURL=checkout.js.map