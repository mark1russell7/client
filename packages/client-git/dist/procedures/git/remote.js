/**
 * git.remote procedure
 *
 * Get or set remote URLs
 */
import { execSync } from "node:child_process";
/**
 * Get or set remote URL
 */
export async function gitRemote(input) {
    const { name, url, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    if (url) {
        // Set the remote URL
        try {
            execSync(`git remote set-url ${name} ${url}`, opts);
        }
        catch {
            // Remote might not exist, try adding it
            execSync(`git remote add ${name} ${url}`, opts);
        }
        return { name, url };
    }
    // Get the remote URL
    const remoteUrl = execSync(`git remote get-url ${name}`, opts).trim();
    return { name, url: remoteUrl };
}
//# sourceMappingURL=remote.js.map