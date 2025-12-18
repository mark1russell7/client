/**
 * cue.add procedure
 *
 * Add a feature to dependencies.json.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import { loadFeatures, loadDependencies, saveDependencies, } from "../../shared.js";
/**
 * Add a feature to dependencies.json
 */
export async function cueAdd(input, ctx) {
    const projectPath = input.cwd ?? process.cwd();
    const feature = input.feature;
    // Load features manifest
    const manifest = await loadFeatures(ctx);
    if (!manifest) {
        return {
            success: false,
            feature,
            added: false,
            error: "Could not load features.json from @mark1russell7/cue package",
        };
    }
    // Validate feature exists
    if (!manifest.features[feature]) {
        const available = Object.keys(manifest.features).join(", ");
        return {
            success: false,
            feature,
            added: false,
            error: `Unknown feature: ${feature}. Available: ${available}`,
        };
    }
    // Load current dependencies
    const deps = await loadDependencies(projectPath, ctx) ?? [];
    // Check if already present
    if (deps.includes(feature)) {
        return {
            success: true,
            feature,
            added: false,
            message: `Feature '${feature}' is already in dependencies`,
        };
    }
    // Add feature and save
    deps.push(feature);
    const saved = await saveDependencies(deps, projectPath, ctx);
    if (!saved) {
        return {
            success: false,
            feature,
            added: false,
            error: "Failed to write dependencies.json",
        };
    }
    return {
        success: true,
        feature,
        added: true,
        message: `Added '${feature}' to dependencies.json`,
    };
}
//# sourceMappingURL=add.js.map