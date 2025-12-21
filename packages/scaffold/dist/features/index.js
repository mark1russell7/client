/**
 * Feature System
 *
 * Resolves features from presets with dependency handling.
 * Integrates with cue/features.json.
 */
import { Feature } from "../schema/types.js";
/**
 * Default feature configuration
 * This should be loaded from @mark1russell7/cue/features.json in production
 */
const defaultConfig = {
    features: {
        git: { dependencies: [] },
        npm: { dependencies: ["git"] },
        ts: { dependencies: ["npm"] },
        react: { dependencies: ["ts"] },
        node: { dependencies: ["ts"] },
        "node-cjs": { dependencies: ["ts"] },
        vite: { dependencies: ["ts"] },
        "vite-react": { dependencies: ["vite", "react"] },
        cue: { dependencies: ["npm"] },
        vitest: { dependencies: ["ts"] },
    },
    presets: {
        lib: ["ts", "cue", "vitest"],
        "react-lib": ["react", "cue", "vitest"],
        app: ["vite-react", "cue", "vitest"],
    },
};
let config = defaultConfig;
/**
 * Set the feature configuration (for loading from cue/features.json)
 */
export function setFeatureConfig(newConfig) {
    config = newConfig;
}
/**
 * Get the current feature configuration
 */
export function getFeatureConfig() {
    return config;
}
/**
 * Map string feature names to Feature enum values
 */
function toFeature(name) {
    const map = {
        core: Feature.Core,
        git: Feature.Core, // git is part of core
        npm: Feature.NPM,
        ts: Feature.TS,
        vitest: Feature.Vitest,
        react: Feature.React,
        node: Feature.Node,
        "node-cjs": Feature.NodeCJS,
        vite: Feature.Vite,
        "vite-react": Feature.ViteReact,
        cue: Feature.Cue,
    };
    return map[name] ?? null;
}
/**
 * Resolve all features including dependencies for a preset.
 *
 * @param preset - The preset name (e.g., "lib", "react-lib", "app")
 * @returns Set of active Feature enum values
 */
export function resolveFeatures(preset) {
    const active = new Set();
    // Always include Core
    active.add(Feature.Core);
    const presetFeatures = config.presets[preset] ?? [];
    function addWithDeps(featureName) {
        const feature = toFeature(featureName);
        if (feature && active.has(feature))
            return;
        if (feature) {
            active.add(feature);
        }
        // Add dependencies
        const deps = config.features[featureName]?.dependencies ?? [];
        for (const dep of deps) {
            addWithDeps(dep);
        }
    }
    for (const f of presetFeatures) {
        addWithDeps(f);
    }
    return active;
}
/**
 * Check if a feature is active given a set of enabled features.
 *
 * @param feature - The feature to check (or undefined for "always include")
 * @param activeFeatures - Set of currently active features
 */
export function isFeatureActive(feature, activeFeatures) {
    if (!feature)
        return true; // No feature = always include
    return activeFeatures.has(feature);
}
/**
 * Get all available presets
 */
export function getPresets() {
    return Object.keys(config.presets);
}
/**
 * Get features for a preset (as string names)
 */
export function getPresetFeatures(preset) {
    return config.presets[preset] ?? [];
}
//# sourceMappingURL=index.js.map