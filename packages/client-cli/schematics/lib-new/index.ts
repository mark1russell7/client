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

import {
  Rule,
  SchematicContext,
  Tree,
  chain,
  externalSchematic,
  noop,
} from "@angular-devkit/schematics";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

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
 * Create the basic directory structure
 */
function createStructure(options: LibNewOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const rootPath = resolveRoot(options.rootPath ?? "~/git");
    const packagePath = join(rootPath, options.name);

    context.logger.info(`Creating package structure at ${packagePath}`);

    // Create src directory
    const srcPath = join(packagePath, "src");
    if (!tree.exists(srcPath)) {
      tree.create(join(srcPath, "index.ts"), "// Entry point\nexport {};\n");
    }

    return tree;
  };
}

/**
 * Run cue-config init to generate config files
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
      // Create repo on GitHub
      execSync(`gh repo create mark1russell7/${options.name} --private --source .`, {
        cwd: packagePath,
        stdio: "inherit",
      });

      // Push to remote
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
 * Main schematic factory
 */
export function libNew(options: LibNewOptions): Rule {
  return chain([
    createStructure(options),
    runCueConfigInit(options),
    runCueConfigGenerate(options),
    validateStructure(options),
    gitInit(options),
    createGitHubRepo(options),
    addToManifest(options),
  ]);
}
