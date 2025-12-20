/**
 * Feature System
 *
 * Resolves features from presets with dependency handling.
 * Integrates with cue/features.json.
 */

import { Feature } from "../schema/types.js";

/**
 * Feature configuration structure (matches cue/features.json)
 */
interface FeatureConfig {
  features: Record<string, { dependencies: string[] }>;
  presets: Record<string, string[]>;
}

/**
 * Default feature configuration
 * This should be loaded from @mark1russell7/cue/features.json in production
 */
const defaultConfig: FeatureConfig = {
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

let config: FeatureConfig = defaultConfig;

/**
 * Set the feature configuration (for loading from cue/features.json)
 */
export function setFeatureConfig(newConfig: FeatureConfig): void {
  config = newConfig;
}

/**
 * Get the current feature configuration
 */
export function getFeatureConfig(): FeatureConfig {
  return config;
}

/**
 * Map string feature names to Feature enum values
 */
function toFeature(name: string): Feature | null {
  const map: Record<string, Feature> = {
    core: Feature.Core,
    git: Feature.Core, // git is part of core
    npm: Feature.NPM,
    ts: Feature.TS,
    vitest: Feature.Vitest,
    react: Feature.React,
    node: Feature.Node,
    "node-cjs": Feature.Node,
    vite: Feature.Vite,
    "vite-react": Feature.Vite,
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
export function resolveFeatures(preset: string): Set<Feature> {
  const active = new Set<Feature>();

  // Always include Core
  active.add(Feature.Core);

  const presetFeatures = config.presets[preset] ?? [];

  function addWithDeps(featureName: string): void {
    const feature = toFeature(featureName);
    if (feature && active.has(feature)) return;

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
export function isFeatureActive(
  feature: Feature | undefined,
  activeFeatures: Set<Feature>
): boolean {
  if (!feature) return true; // No feature = always include
  return activeFeatures.has(feature);
}

/**
 * Get all available presets
 */
export function getPresets(): string[] {
  return Object.keys(config.presets);
}

/**
 * Get features for a preset (as string names)
 */
export function getPresetFeatures(preset: string): string[] {
  return config.presets[preset] ?? [];
}
