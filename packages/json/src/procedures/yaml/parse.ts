/**
 * yaml.parse procedure
 *
 * Parse YAML text into a JSON value. With `all`, the text can have more than one document, and
 * the value is the list of documents.
 */

import { parseYaml } from "../../yaml.js";
import type { YamlParseInput, YamlParseOutput } from "../../types.js";

/**
 * Parse YAML text into a JSON value
 */
export async function yamlParse(input: YamlParseInput): Promise<YamlParseOutput> {
  return { value: parseYaml(input.text, { all: input.all }) };
}
