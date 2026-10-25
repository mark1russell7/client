/**
 * yaml.parse procedure
 *
 * Parse YAML text into a JSON value. With `all`, the text can have more than one document, and
 * the value is the list of documents. The first start loads the `yaml` package (roadmap O50).
 */

import { loadYaml } from "../../yaml-load.js";
import type { YamlParseInput, YamlParseOutput } from "../../types.js";

/**
 * Parse YAML text into a JSON value
 */
export async function yamlParse(input: YamlParseInput): Promise<YamlParseOutput> {
  const { parseYaml } = await loadYaml();
  return { value: parseYaml(input.text, { all: input.all }) };
}
