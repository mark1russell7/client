/**
 * The lazy load of `./yaml.js` for the YAML procedures (roadmap O50).
 *
 * The `yaml` package has approximately 70 modules. The procedures `yaml.parse` and
 * `yaml.stringify` load it when they first start, so an import of `./module` or `./register` does
 * not load it. The root also exports `parseYaml` and `stringifyYaml`. These functions are
 * synchronous, thus the root keeps its static import of `./yaml.js`.
 */

/** The functions of `./yaml.js`. */
export type YamlFunctions = typeof import("./yaml.js");

let loading: Promise<YamlFunctions> | undefined;

/** This function gives the functions of `./yaml.js`. The first use loads the module, and each later use gets the same load. */
export function loadYaml(): Promise<YamlFunctions> {
  loading ??= import("./yaml.js");
  return loading;
}
