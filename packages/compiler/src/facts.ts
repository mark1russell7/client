/**
 * The facts about procedures that the compiler reads. They are the manifest entry of a path,
 * the expose rule, the raw-input rule and the body of a defined procedure.
 *
 * A browser has only a manifest (`procedure.manifest`, roadmap R17). A host has the registry.
 * The two functions of this module give the same facts from each source, so the passes do not
 * know the source.
 */

import {
  allCoreProcedures,
  describeProcedureEntry,
  describeRegistry,
  hashOf,
  isControlFlowPath,
  pathToKey,
  runtimeProgramOf,
  RAW_INPUT_TAG,
  RUNS_REFS_TAG,
  type AnyProcedure,
  type ProcedureEntry,
  type ProcedureManifest,
  type ProcedurePath,
} from "@procedures/client/browser";

/** The procedure facts of the compiler. */
export interface ProcedureFacts {
  /** The hash of the manifest that the host gives (`procedure.manifest`). */
  readonly hash: string;
  /** The keys of the procedures that take raw input, without the control-flow procedures. */
  readonly rawKeys: readonly string[];
  /** The manifest entry of a path, or undefined when the source does not have the path. */
  entry(path: ProcedurePath): ProcedureEntry | undefined;
  /** True when the host lets a data-driven procedure call the path. */
  exposed(path: ProcedurePath): boolean;
  /** True when hydration gives the procedure its input raw (`rawInputRule()` of the client). */
  rawInput(path: ProcedurePath): boolean;
  /** The program of a procedure that `procedure.define` made, when the source can see it. */
  body(path: ProcedurePath): unknown;
  /** The core procedure at the path, when the entry describes exactly that procedure. */
  core(path: ProcedurePath): AnyProcedure | undefined;
}

/** A registry, as the compiler reads it. */
export interface RegistryLike {
  get(path: ProcedurePath): AnyProcedure | undefined;
  getAll(): AnyProcedure[];
}

/** The options of the fact sources. */
export interface FactsOptions {
  /** The expose rule of the host. The default exposes each procedure. */
  readonly expose?: ((path: ProcedurePath) => boolean) | undefined;
}

/** True when an entry takes its input raw: the rule of `takesRawInput()`, from the manifest. */
export function entryTakesRawInput(entry: ProcedureEntry): boolean {
  const tags = entry.tags ?? [];
  return isControlFlowPath(entry.path) || tags.includes(RUNS_REFS_TAG) || tags.includes(RAW_INPUT_TAG);
}

/** True when the path elements are strings: only such a path can name a procedure. */
export function isStringPath(path: readonly unknown[]): path is ProcedurePath {
  return path.every((segment) => typeof segment === "string");
}

let coreDescriptions: Map<string, { procedure: AnyProcedure; hash: string }> | undefined;

/** The core procedures by key, with the hash of their manifest entries. */
function coreByKey(): Map<string, { procedure: AnyProcedure; hash: string }> {
  if (!coreDescriptions) {
    coreDescriptions = new Map(
      allCoreProcedures.map((procedure) => [pathToKey(procedure.path), { procedure, hash: hashOf(describeProcedureEntry(procedure)) }]),
    );
  }
  return coreDescriptions;
}

/**
 * This function gives the core procedure that an entry describes. The entry must be the same as
 * the description of the core procedure: a host can register a different procedure at a core path.
 */
export function coreProcedureOf(entry: ProcedureEntry | undefined): AnyProcedure | undefined {
  if (!entry) return undefined;
  const core = coreByKey().get(entry.key);
  return core && core.hash === hashOf(entry) ? core.procedure : undefined;
}

/** The facts of a manifest. The manifest has only the procedures that its host exposes. */
export function manifestFacts(manifest: ProcedureManifest, options: FactsOptions = {}): ProcedureFacts {
  const byKey = new Map(manifest.procedures.map((entry) => [entry.key, entry]));
  const expose = options.expose;
  const rawKeys = manifest.procedures.filter((entry) => entryTakesRawInput(entry) && !isControlFlowPath(entry.path)).map((entry) => entry.key);
  // The key of a path, as the registry finds it: the segments joined with dots, also for a segment that is not a string
  const lookup = (path: ProcedurePath): ProcedureEntry | undefined => byKey.get(pathToKey(path));
  return {
    hash: manifest.hash,
    rawKeys,
    entry: lookup,
    exposed: (path) => (expose ? expose(path) : true),
    rawInput: (path) => {
      const entry = lookup(path);
      return entry ? entryTakesRawInput(entry) : isControlFlowPath(path);
    },
    body: () => undefined,
    core: (path) => coreProcedureOf(lookup(path)),
  };
}

/**
 * The facts of a registry. The entries include the procedures that the host does not expose, so
 * the check can tell "not exposed" from "unknown". The hash is the hash of `procedure.manifest` on
 * the host: the manifest of the exposed procedures.
 */
export function registryFacts(registry: RegistryLike, options: FactsOptions = {}): ProcedureFacts {
  const manifest = describeRegistry(registry, { withoutHandler: true });
  const expose = options.expose;
  const exposedEntries = manifest.procedures.filter((entry) => entry.hasHandler && (!expose || expose(entry.path)));
  const facts = manifestFacts({ ...manifest, hash: hashOf(exposedEntries) }, options);
  return {
    ...facts,
    body: (path) => {
      if (!isStringPath(path)) return undefined;
      const procedure = registry.get(path);
      return procedure ? runtimeProgramOf(procedure) : undefined;
    },
  };
}

/**
 * The facts with the procedures that the program defines (`procedure.define` with a literal path
 * and body). A later call of such a path is known, and its body gives its effects.
 */
export function withDefinitions(facts: ProcedureFacts, definitions: ReadonlyMap<string, Definition>): ProcedureFacts {
  if (definitions.size === 0) return facts;
  const defined = (path: ProcedurePath): Definition | undefined => (isStringPath(path) ? definitions.get(pathToKey(path)) : undefined);
  const definedRaw = [...definitions.values()].filter((definition) => entryTakesRawInput(definition.entry)).map((definition) => definition.entry.key);
  return {
    hash: facts.hash,
    rawKeys: [...new Set([...facts.rawKeys, ...definedRaw])],
    entry: (path) => defined(path)?.entry ?? facts.entry(path),
    exposed: (path) => facts.exposed(path),
    rawInput: (path) => {
      const definition = defined(path);
      return definition ? entryTakesRawInput(definition.entry) : facts.rawInput(path);
    },
    body: (path) => {
      const definition = defined(path);
      return definition ? definition.body : facts.body(path);
    },
    core: (path) => (defined(path) ? undefined : facts.core(path)),
  };
}

/** A procedure that the program defines with `procedure.define`. */
export interface Definition {
  readonly entry: ProcedureEntry;
  readonly body: unknown;
  /** The pointer of the aggregation in the program. */
  readonly pointer: string;
}
