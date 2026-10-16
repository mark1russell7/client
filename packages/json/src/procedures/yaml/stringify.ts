/**
 * yaml.stringify procedure
 *
 * Write a JSON value as YAML text. `yaml.parse` of the text gives a value equal to the input.
 */

import { assertJson } from "../../value.js";
import { stringifyYaml } from "../../yaml.js";
import type { YamlStringifyInput, YamlStringifyOutput } from "../../types.js";

/**
 * Write a JSON value as YAML text
 */
export async function yamlStringify(input: YamlStringifyInput): Promise<YamlStringifyOutput> {
  assertJson(input.value, "yaml.stringify: value");
  return { text: stringifyYaml(input.value, { indent: input.indent, lineWidth: input.lineWidth, sortKeys: input.sortKeys }) };
}
