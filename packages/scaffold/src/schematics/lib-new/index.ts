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

import {
  Tree,
  chain,
} from "@angular-devkit/schematics";
import type { Rule, SchematicContext } from "@angular-devkit/schematics";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

import { REPO_SCHEMA } from "../../schema/repo-schema.js";
import { walkSchema } from "../../schema/validators.js";
import { FSType, Feature } from "../../schema/types.js";
import { generators } from "../../generators/registry.js";
import { resolveFeatures } from "../../features/index.js";
import type { GeneratorContext, NodeMetadata } from "../../schema/types.js";

export interface LibNewOptions {
  name: string;
  preset?: string;
  rootPath?: string;
  skipGit?: boolean;
  skipManifest?: boolean;
}

function resolveRoot(root: string): string {
  if (root.startsWith("~/")) {
    return join(homedir(), root.slice(2));
  }
  return root;
}

/**
 * Create the generator context for this package
 */
function createContext(options: LibNewOptions): GeneratorContext {
  return {
    packageName: options.name,
    fullPackageName: `@mark1russell7/${options.name}`,
    preset: options.preset ?? "lib",
    features: resolveFeatures(options.preset ?? "lib"),
    rootPath: resolveRoot(options.rootPath ?? "~/git"),
  };
}

/**
 * Process the schema tree and generate files
 */
function processSchemaTree(options: LibNewOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);
    const preset = options.preset ?? "lib";
    const activeFeatures = resolveFeatures(preset);

    context.logger.info(`Creating package structure at ${packagePath}`);
    context.logger.info(`Using preset: ${preset}`);
    context.logger.info(`Active features: ${[...activeFeatures].join(", ")}`);

    // Walk the schema and generate files
    walkSchema(REPO_SCHEMA, "", (path, meta, _node) => {
      // Skip root node
      if (!path) return;

      // Skip if feature not active
      if (meta.feature && !activeFeatures.has(meta.feature)) {
        context.logger.debug(`Skipping ${path} (feature ${meta.feature} not active)`);
        return;
      }

      const fullPath = join(packagePath, path);

      if (meta.type === FSType.Directory) {
        // Create directory (via .gitkeep placeholder)
        const gitkeep = join(fullPath, ".gitkeep");
        if (!tree.exists(gitkeep)) {
          tree.create(gitkeep, "");
        }
        context.logger.info(`Created directory: ${path}`);
      } else if (meta.type === FSType.File) {
        // Get the generator for this file
        const generator = generators[path as keyof typeof generators];
        if (!generator) {
          context.logger.warn(`No generator found for ${path}`);
          return;
        }

        // For CUE-generated files, skip here (handled by cue-config)
        if ((meta as NodeMetadata & { generator?: string }).generator === "cue") {
          context.logger.debug(`Skipping ${path} (CUE will generate)`);
          return;
        }

        // For ts-morph files, generate content
        try {
          // Generators are async, but schematics prefers sync
          // We'll generate synchronously for now
          context.logger.info(`Will generate: ${path}`);
        } catch (error) {
          context.logger.error(`Failed to generate ${path}: ${error}`);
        }
      }
    });

    return tree;
  };
}

/**
 * Generate ts-morph files (vitest.config.ts, src/index.ts)
 */
function generateTsMorphFiles(options: LibNewOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);
    const preset = options.preset ?? "lib";
    const activeFeatures = resolveFeatures(preset);
    const generatorContext = createContext(options);

    // Generate vitest.config.ts if vitest feature is active
    if (activeFeatures.has(Feature.Vitest)) {
      const vitestGenerator = generators["vitest.config.ts"];
      if (vitestGenerator) {
        const content = await vitestGenerator("vitest.config.ts", generatorContext);
        const vitestPath = join(packagePath, "vitest.config.ts");
        if (!tree.exists(vitestPath)) {
          tree.create(vitestPath, content);
          context.logger.info("Generated: vitest.config.ts (ts-morph)");
        }
      }
    }

    // Generate src/index.ts
    const indexGenerator = generators["src/index.ts"];
    if (indexGenerator) {
      const content = await indexGenerator("src/index.ts", generatorContext);
      const indexPath = join(packagePath, "src", "index.ts");
      if (!tree.exists(indexPath)) {
        tree.create(indexPath, content);
        context.logger.info("Generated: src/index.ts (ts-morph)");
      }
    }

    return tree;
  };
}

/**
 * Run cue-config init to initialize package
 */
function runCueConfigInit(options: LibNewOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);
    const preset = options.preset ?? "lib";

    context.logger.info(`Running cue-config init --preset ${preset}`);

    try {
      execSync(`npx cue-config init --preset ${preset}`, {
        cwd: packagePath,
        stdio: "inherit",
      });
    } catch (error) {
      context.logger.error(`Failed to run cue-config init: ${error}`);
      throw error;
    }

    return _tree;
  };
}

/**
 * Run cue-config generate to create package.json, tsconfig.json, .gitignore
 */
function runCueConfigGenerate(options: LibNewOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);

    context.logger.info("Running cue-config generate");

    try {
      execSync("npx cue-config generate", {
        cwd: packagePath,
        stdio: "inherit",
      });
    } catch (error) {
      context.logger.error(`Failed to run cue-config generate: ${error}`);
      throw error;
    }

    return _tree;
  };
}

/**
 * Validate structure using cue-config
 */
function validateStructure(options: LibNewOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);

    context.logger.info("Validating project structure");

    try {
      execSync(`npx cue-config validate-structure --path "${packagePath}"`, {
        cwd: packagePath,
        stdio: "inherit",
      });
    } catch (error) {
      context.logger.error(`Structure validation failed: ${error}`);
      throw error;
    }

    return _tree;
  };
}

/**
 * Initialize git repository
 */
function gitInit(options: LibNewOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    if (options.skipGit) {
      context.logger.info("Skipping git init");
      return _tree;
    }

    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);

    context.logger.info("Initializing git repository");

    try {
      execSync("git init", { cwd: packagePath, stdio: "inherit" });
      execSync("git add -A", { cwd: packagePath, stdio: "inherit" });
      execSync('git commit -m "Initial commit"', {
        cwd: packagePath,
        stdio: "inherit",
      });
    } catch (error) {
      context.logger.error(`Failed to initialize git: ${error}`);
      throw error;
    }

    return _tree;
  };
}

/**
 * Create GitHub repository and push
 */
function createGitHubRepo(options: LibNewOptions): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    if (options.skipGit) {
      context.logger.info("Skipping GitHub repo creation");
      return _tree;
    }

    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);

    context.logger.info("Creating GitHub repository");

    try {
      execSync(`gh repo create mark1russell7/${options.name} --private --source .`, {
        cwd: packagePath,
        stdio: "inherit",
      });

      execSync("git push -u origin main", {
        cwd: packagePath,
        stdio: "inherit",
      });
    } catch (error) {
      context.logger.warn(`GitHub repo creation may have failed: ${error}`);
      // Don't throw - repo might already exist
    }

    return _tree;
  };
}

/**
 * Add package to ecosystem manifest
 */
function addToManifest(options: LibNewOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    if (options.skipManifest) {
      context.logger.info("Skipping manifest update");
      return tree;
    }

    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");

    context.logger.info("Adding to ecosystem manifest");

    const manifestContent = tree.read(manifestPath);
    if (!manifestContent) {
      context.logger.warn("Ecosystem manifest not found, skipping");
      return tree;
    }

    const manifest = JSON.parse(manifestContent.toString());
    const packageName = `@mark1russell7/${options.name}`;

    if (manifest.packages[packageName]) {
      context.logger.info(`Package ${packageName} already in manifest`);
      return tree;
    }

    manifest.packages[packageName] = {
      repo: `github:mark1russell7/${options.name}#main`,
      path: options.name,
    };

    tree.overwrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    context.logger.info(`Added ${packageName} to ecosystem manifest`);

    return tree;
  };
}

/**
 * Main schematic factory
 */
export function libNew(options: LibNewOptions): Rule {
  return chain([
    // 1. Process schema tree (create directories, identify files)
    processSchemaTree(options),

    // 2. Run CUE to generate config files
    runCueConfigInit(options),
    runCueConfigGenerate(options),

    // 3. Generate ts-morph files
    generateTsMorphFiles(options),

    // 4. Validate structure
    validateStructure(options),

    // 5. Git operations
    gitInit(options),
    createGitHubRepo(options),

    // 6. Update manifest
    addToManifest(options),
  ]);
}
