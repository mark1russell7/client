/**
 * cue.init procedure
 *
 * Initialize dependencies.json with a preset.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import { resolve } from "node:path";
import { loadFeatures, saveDependencies, fileExists, mkdir, writeFile, } from "../../shared.js";
/**
 * Initialize a project with dependencies.json
 */
export async function cueInit(input, ctx) {
    const projectPath = input.cwd ?? process.cwd();
    const presetName = input.preset ?? "lib";
    const created = [];
    // Load features manifest
    const manifest = await loadFeatures(ctx);
    if (!manifest) {
        return {
            success: false,
            preset: presetName,
            created: [],
            error: "Could not load features.json from @mark1russell7/cue package",
        };
    }
    // Validate preset
    const preset = manifest.presets[presetName];
    if (!preset) {
        const available = Object.keys(manifest.presets).join(", ");
        return {
            success: false,
            preset: presetName,
            created: [],
            error: `Unknown preset: ${presetName}. Available: ${available}`,
        };
    }
    // Check if dependencies.json exists
    const depsPath = resolve(projectPath, "dependencies.json");
    if (await fileExists(depsPath, ctx)) {
        if (!input.force) {
            return {
                success: true,
                preset: presetName,
                created: [],
                message: "dependencies.json already exists (use force: true to overwrite)",
            };
        }
    }
    // Create dependencies.json
    const saved = await saveDependencies(preset, projectPath, ctx);
    if (!saved) {
        return {
            success: false,
            preset: presetName,
            created: [],
            error: "Failed to write dependencies.json",
        };
    }
    created.push("dependencies.json");
    // Create src directory if needed
    const srcPath = resolve(projectPath, "src");
    if (!(await fileExists(srcPath, ctx))) {
        await mkdir(srcPath, ctx);
        created.push("src/");
    }
    // Create src/index.ts if needed
    const indexPath = resolve(projectPath, "src", "index.ts");
    if (!(await fileExists(indexPath, ctx))) {
        await writeFile(indexPath, "// Entry point\nexport {};\n", ctx);
        created.push("src/index.ts");
    }
    return {
        success: true,
        preset: presetName,
        created,
        message: `Initialized with preset '${presetName}'. Run cue.generate to create config files.`,
    };
}
//# sourceMappingURL=init.js.map