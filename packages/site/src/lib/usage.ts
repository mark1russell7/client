/**
 * The "Use it" examples of a procedure page: how to call the procedure from TypeScript, from the
 * CLI and as data. Each procedure page shows them, so a search for a procedure finds code that runs.
 */

import type { Field, JsonSchema, ProcedureInfo } from "../data";

/** A value of a field for the examples: the default, the first value of an enum, or a value of the type. */
function exampleValue(name: string, schema: JsonSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  return valueOfType(name, typeof type === "string" ? type : "string");
}

function valueOfType(name: string, type: string): unknown {
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return true;
  if (type.endsWith("[]") || type === "array") return [];
  if (type === "object" || type.startsWith("Record<")) return {};
  return `<${name}>`;
}

/**
 * The example input of a procedure: its required fields. The typed fields of a core procedure
 * come first (its JSON Schema accepts any input), then the JSON Schema of the others.
 */
export function exampleInput(procedure: Pick<ProcedureInfo, "input" | "fields">): Record<string, unknown> {
  const fields: Field[] | null = procedure.fields;
  if (fields && fields.length > 0) {
    return Object.fromEntries(fields.filter((field) => !field.optional).map((field) => [field.name, valueOfType(field.name, field.type)]));
  }
  const required = new Set(procedure.input.required ?? []);
  return Object.fromEntries(
    Object.entries(procedure.input.properties ?? {})
      .filter(([name]) => required.has(name))
      .map(([name, schema]) => [name, exampleValue(name, schema)]),
  );
}

/** The input in the style of TypeScript code: `{ a: 1, b: "<b>" }`. */
function inputCode(input: Record<string, unknown>): string {
  const entries = Object.entries(input).map(([key, value]) => `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

/**
 * The TypeScript of a call of the procedure. A core procedure is in `allCoreProcedures`. A
 * procedure of another package registers when its package loads. The code prints the result.
 */
export function usageCode(procedure: Pick<ProcedureInfo, "path" | "package" | "input" | "fields">, packageName: string): string {
  const core = procedure.package === "client";
  return [
    `import { Client, LocalTransport, PROCEDURE_REGISTRY${core ? ", allCoreProcedures" : ""} } from "@mark1russell7/client";`,
    ...(core
      ? ["", "for (const procedure of allCoreProcedures) {", "  if (!PROCEDURE_REGISTRY.has(procedure.path)) PROCEDURE_REGISTRY.register(procedure);", "}"]
      : [`import "${packageName}"; // registers its procedures`]),
    "",
    "const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));",
    `const result = await client.exec(${JSON.stringify(procedure.path)}, ${inputCode(exampleInput(procedure))});`,
    "console.log(JSON.stringify(result));",
  ].join("\n");
}
