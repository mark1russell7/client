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
    features: Record<string, {
        dependencies: string[];
    }>;
    presets: Record<string, string[]>;
}
/**
 * Set the feature configuration (for loading from cue/features.json)
 */
export declare function setFeatureConfig(newConfig: FeatureConfig): void;
/**
 * Get the current feature configuration
 */
export declare function getFeatureConfig(): FeatureConfig;
/**
 * Resolve all features including dependencies for a preset.
 *
 * @param preset - The preset name (e.g., "lib", "react-lib", "app")
 * @returns Set of active Feature enum values
 */
export declare function resolveFeatures(preset: string): Set<Feature>;
/**
 * Check if a feature is active given a set of enabled features.
 *
 * @param feature - The feature to check (or undefined for "always include")
 * @param activeFeatures - Set of currently active features
 */
export declare function isFeatureActive(feature: Feature | undefined, activeFeatures: Set<Feature>): boolean;
/**
 * Get all available presets
 */
export declare function getPresets(): string[];
/**
 * Get features for a preset (as string names)
 */
export declare function getPresetFeatures(preset: string): string[];
export {};
//# sourceMappingURL=index.d.ts.map