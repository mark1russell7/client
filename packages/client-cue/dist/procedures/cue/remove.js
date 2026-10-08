/**
 * cue.remove procedure
 *
 * Remove a feature from dependencies.json.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import { loadDependencies, saveDependencies } from "../../shared.js";
/**
 * Remove a feature from dependencies.json
 */
export async function cueRemove(input, ctx) {
    const projectPath = input.cwd ?? process.cwd();
    const feature = input.feature;
    // Load current dependencies
    const deps = await loadDependencies(projectPath, ctx);
    if (!deps) {
        return {
            success: false,
            feature,
            removed: false,
            error: "No dependencies.json found. Run cue.init first.",
        };
    }
    // Check if feature is present
    const idx = deps.indexOf(feature);
    if (idx === -1) {
        return {
            success: true,
            feature,
            removed: false,
            message: `Feature '${feature}' is not in dependencies`,
        };
    }
    // Remove feature and save
    deps.splice(idx, 1);
    const saved = await saveDependencies(deps, projectPath, ctx);
    if (!saved) {
        return {
            success: false,
            feature,
            removed: false,
            error: "Failed to write dependencies.json",
        };
    }
    return {
        success: true,
        feature,
        removed: true,
        message: `Removed '${feature}' from dependencies.json`,
    };
}
//# sourceMappingURL=remove.js.map