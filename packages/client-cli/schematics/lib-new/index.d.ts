/**
 * lib-new schematic
 *
 * Creates a new package with standard ecosystem structure:
 * 1. Create directory structure (src/, package.json, etc.)
 * 2. Run cue-config init --preset {preset}
 * 3. Validate structure
 * 4. git init
 * 5. Add to ecosystem manifest
 * 6. Create GitHub repo
 * 7. Initial push
 */
import { Rule } from "@angular-devkit/schematics";
export interface LibNewOptions {
    name: string;
    preset?: string;
    rootPath?: string;
    skipGit?: boolean;
    skipManifest?: boolean;
}
/**
 * Main schematic factory
 */
export declare function libNew(options: LibNewOptions): Rule;
//# sourceMappingURL=index.d.ts.map