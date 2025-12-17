/**
 * lib.audit procedure
 *
 * Validates all registered packages against the ecosystem's projectTemplate.
 * Reads the template from ecosystem.manifest.json (single source of truth).
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { readFile, access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
/**
 * Resolve ~ to home directory
 */
function resolveRoot(root) {
    if (root.startsWith("~/")) {
        return join(homedir(), root.slice(2));
    }
    return root;
}
/**
 * Check if path exists
 */
async function pathExists(path) {
    try {
        await access(path, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Load ecosystem manifest
 */
async function loadManifest(rootPath) {
    const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content);
}
/**
 * Audit a single package against the template
 */
async function auditPackage(pkgPath, pkgName, template, fix) {
    const missingFiles = [];
    const missingDirs = [];
    const fixedFiles = [];
    const fixedDirs = [];
    // Check required directories
    for (const dir of template.dirs) {
        const dirPath = join(pkgPath, dir);
        if (!(await pathExists(dirPath))) {
            missingDirs.push(dir);
            if (fix) {
                try {
                    await mkdir(dirPath, { recursive: true });
                    fixedDirs.push(dir);
                }
                catch {
                    // Could not fix
                }
            }
        }
    }
    // Check required files
    for (const file of template.files) {
        const filePath = join(pkgPath, file);
        if (!(await pathExists(filePath))) {
            missingFiles.push(file);
            if (fix) {
                // Only fix certain files with sensible defaults
                try {
                    if (file === "dependencies.json") {
                        await writeFile(filePath, JSON.stringify({ $schema: "./node_modules/@mark1russell7/cue/dependencies/schema.json", dependencies: ["ts", "node"] }, null, 2) + "\n");
                        fixedFiles.push(file);
                    }
                    else if (file === ".gitignore") {
                        await writeFile(filePath, "node_modules/\ndist/\n.tsbuildinfo\n");
                        fixedFiles.push(file);
                    }
                    // Don't auto-create package.json or tsconfig.json - those need cue-config generate
                }
                catch {
                    // Could not fix
                }
            }
        }
    }
    // Remove fixed items from missing lists
    const stillMissingFiles = missingFiles.filter((f) => !fixedFiles.includes(f));
    const stillMissingDirs = missingDirs.filter((d) => !fixedDirs.includes(d));
    return {
        name: pkgName,
        path: pkgPath,
        valid: stillMissingFiles.length === 0 && stillMissingDirs.length === 0,
        missingFiles: stillMissingFiles,
        missingDirs: stillMissingDirs,
        ...(fix && fixedFiles.length > 0 ? { fixedFiles } : {}),
        ...(fix && fixedDirs.length > 0 ? { fixedDirs } : {}),
    };
}
/**
 * Audit all packages in the ecosystem against projectTemplate
 */
export async function libAudit(input) {
    const defaultRoot = join(homedir(), "git");
    const rootPath = input.rootPath ?? defaultRoot;
    // Load manifest
    let manifest;
    try {
        manifest = await loadManifest(rootPath);
    }
    catch (error) {
        return {
            success: false,
            template: { files: [], dirs: [] },
            results: [],
            summary: { total: 0, valid: 0, invalid: 0 },
        };
    }
    const resolvedRoot = resolveRoot(manifest.root);
    const template = manifest.projectTemplate;
    const results = [];
    // Audit each registered package
    for (const [pkgName, entry] of Object.entries(manifest.packages)) {
        const pkgPath = join(resolvedRoot, entry.path);
        // Skip if package directory doesn't exist
        if (!(await pathExists(pkgPath))) {
            results.push({
                name: pkgName,
                path: pkgPath,
                valid: false,
                missingFiles: ["(package not cloned)"],
                missingDirs: [],
            });
            continue;
        }
        const result = await auditPackage(pkgPath, pkgName, template, input.fix);
        results.push(result);
    }
    const validCount = results.filter((r) => r.valid).length;
    const invalidCount = results.filter((r) => !r.valid).length;
    return {
        success: invalidCount === 0,
        template,
        results,
        summary: {
            total: results.length,
            valid: validCount,
            invalid: invalidCount,
        },
    };
}
//# sourceMappingURL=audit.js.map