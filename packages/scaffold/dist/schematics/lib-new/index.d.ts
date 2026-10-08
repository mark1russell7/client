/**
 * lib-new schematic
 *
 * Schema-driven package creation:
 * 1. Walk REPO_SCHEMA to generate files based on active features
 * 2. Run cue-config init and generate
 * 3. Generate ts-morph files (vitest.config.ts, src/index.ts)
 * 4. Validate structure
 * 5. git init
 * 6. Add to ecosystem manifest
 * 7. Create GitHub repo and push
 */
import type { Rule } from "@angular-devkit/schematics";
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