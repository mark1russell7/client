/**
 * The help text of a command line: the help of one command, of a group of commands and of the
 * whole program.
 *
 * Each function gives the text and prints nothing. The caller prints it.
 */

import type { GlobalFlag } from "./args.js";
import { findChildren } from "./args.js";
import {
  extractSchemaFields,
  fieldWithoutSchema,
  toKebab,
  typeName,
  type CLIMeta,
  type CommandLike,
  type SchemaFieldInfo,
} from "./fields.js";

/** The options of the help text. */
export interface HelpOptions {
  /** The name of the program, as a person types it, for example `mark`. */
  name: string;
  /** The global flags that the help lists. The help lists each flag that is not `hidden`. */
  globals?: readonly GlobalFlag[] | undefined;
}

/** This function gives the hint of a field on the command line, for the help text. */
function valueHint(field: SchemaFieldInfo): string {
  const type = field.fieldType;
  switch (type.kind) {
    case "boolean":
      return "";
    case "array":
      return ` <${typeName(type.item ?? { kind: "any" })}>... (repeat the flag, or give a JSON array)`;
    case "record":
      return " <key=value>... (repeat the flag, or give a JSON object)";
    case "object":
    case "any":
      return " <json>";
    case "enum":
      return ` <${(field.enumValues ?? []).join("|")}>`;
    default:
      return ` <${typeName(type)}>`;
  }
}

/**
 * This function gives the help text of one command. `schema` is the input schema, or the fields
 * of the input. `result` gives the fields of the result. The help lists them after the options.
 */
export function generateHelp(
  path: readonly string[],
  meta: CLIMeta,
  schema: unknown,
  result: readonly SchemaFieldInfo[],
  options: HelpOptions
): string {
  const positionalArgs = meta.args ?? [];
  const shorts = meta.shorts ?? {};

  const lines: string[] = [];

  const schemaFields: SchemaFieldInfo[] = Array.isArray(schema)
    ? (schema as SchemaFieldInfo[])
    : schema
      ? extractSchemaFields(schema)
      : [];
  const schemaFieldMap = new Map(schemaFields.map((f) => [f.name, f]));

  // Command signature: the last positional array takes the rest of the arguments
  const cmdName = `${options.name} ${path.join(" ")}`;
  const posStr = positionalArgs
    .map((a, i) => {
      const many = i === positionalArgs.length - 1 && schemaFieldMap.get(a)?.fieldType.kind === "array";
      return many ? `<${a}...>` : `<${a}>`;
    })
    .join(" ");
  lines.push(`Usage: ${cmdName}${posStr ? " " + posStr : ""} [options]`);
  lines.push("");

  if (meta.description) {
    lines.push(meta.description);
    lines.push("");
  }

  if (positionalArgs.length > 0) {
    lines.push("Arguments:");
    for (const arg of positionalArgs) {
      const fieldInfo = schemaFieldMap.get(arg);
      const typeStr = fieldInfo ? ` (${fieldInfo.type})` : "";
      const reqStr = fieldInfo?.required ? " [required]" : "";
      const descStr = fieldInfo?.description ? `  ${fieldInfo.description}` : "";
      lines.push(`  ${arg}${typeStr}${reqStr}`);
      if (descStr) {
        lines.push(`    ${descStr}`);
      }
    }
    lines.push("");
  }

  // Options: each schema field that is not positional, with its short flag if it has one
  const optionLines: string[] = [];
  const positionalSet = new Set(positionalArgs);
  const listed = new Set<string>();
  const optionFields = [
    ...Object.keys(shorts).map((name) => schemaFieldMap.get(name) ?? fieldWithoutSchema(name)),
    ...schemaFields.filter((field) => !(field.name in shorts) && !positionalSet.has(field.name)),
  ];
  for (const field of optionFields) {
    if (listed.has(field.name)) {
      continue;
    }
    listed.add(field.name);
    const short = shorts[field.name];
    const kebab = toKebab(field.name);
    const flag = short ? `  -${short}, --${kebab}` : `      --${kebab}`;
    const negation = field.fieldType.kind === "boolean" ? ` (or --no-${kebab})` : "";
    const reqStr = field.required ? " [required]" : "";
    const defaultStr = field.defaultValue !== undefined ? ` (default: ${JSON.stringify(field.defaultValue)})` : "";
    optionLines.push(`${flag}${valueHint(field)}${negation}${reqStr}${defaultStr}`);
    if (field.description) {
      optionLines.push(`        ${field.description}`);
    }
  }

  if (optionLines.length > 0) {
    lines.push("Options:");
    lines.push(...optionLines);
  }

  if (result.length > 0) {
    lines.push("");
    lines.push("Result:");
    for (const field of result) {
      const optional = field.required ? "" : ", optional";
      lines.push(`  ${field.name} (${field.type}${optional})`);
      if (field.description) {
        lines.push(`        ${field.description}`);
      }
    }
  }

  const globals = (options.globals ?? []).filter((flag) => !flag.hidden);
  if (globals.length > 0) {
    lines.push("");
    lines.push("Global Options (before the command, or after it when the command has no flag of that name):");
    for (const flag of globals) {
      const name = flag.short ? `-${flag.short}, --${flag.long}` : `    --${flag.long}`;
      lines.push(`  ${name.padEnd(18)} ${flag.description}`);
    }
  }

  return lines.join("\n");
}

/**
 * This function gives the help of a group of commands: one message for each line. It gives
 * undefined when no command is in the group. A message can contain a line break.
 */
export function groupHelp(name: string, commands: readonly CommandLike[], path: readonly string[]): string[] | undefined {
  const children = findChildren(commands, path);
  if (children.length === 0) {
    return undefined;
  }
  const groupName = path.join(" ");
  const lines = [`${groupName} commands:\n`];

  // The commands directly in the group
  for (const child of children.filter((p) => p.path.length === path.length + 1)) {
    const meta = (child.metadata ?? {}) as CLIMeta;
    const cmdName = child.path[child.path.length - 1] ?? "";
    lines.push(`  ${name} ${groupName} ${cmdName}  ${meta.description ?? ""}`);
  }

  // The groups in the group
  const childGroups = new Set<string>();
  for (const child of children) {
    if (child.path.length > path.length + 1) {
      const groupSeg = child.path[path.length];
      if (groupSeg) childGroups.add(groupSeg);
    }
  }
  for (const group of childGroups) {
    lines.push(`  ${name} ${groupName} ${group}  ${group} commands`);
  }

  lines.push(`\nRun '${name} ${groupName} <command> --help' for more info.`);
  return lines;
}

/** The options of the help of the whole program. */
export interface RootHelpOptions {
  /** The name of the program. */
  name: string;
  /** The first line of the help. The default is the name. */
  title?: string | undefined;
  /** The lines after the list of the commands. */
  footer?: readonly string[] | undefined;
}

/**
 * This function gives the help of the whole program: the commands by their first word. It gives
 * one message for each line. A message can contain a line break.
 */
export function rootHelp(commands: readonly CommandLike[], options: RootHelpOptions): string[] {
  const { name } = options;
  const lines = [`${options.title ?? name}\n`, "Commands:\n"];

  const groups = new Map<string, CommandLike[]>();
  for (const proc of commands) {
    const group = proc.path[0] ?? "other";
    const members = groups.get(group) ?? [];
    members.push(proc);
    groups.set(group, members);
  }

  for (const [group, procs] of groups) {
    lines.push(`  ${group}`);
    for (const proc of procs) {
      const meta = (proc.metadata ?? {}) as CLIMeta;
      lines.push(`    ${name} ${proc.path.join(" ")}  ${meta.description ?? ""}`);
    }
    lines.push("");
  }

  lines.push(`Run '${name} <command> --help' for more information.`);
  lines.push(...(options.footer ?? []));
  return lines;
}

/** This function gives the message of a validation error: one line for each issue of a Zod error. */
export function validationMessage(error: unknown): string {
  const issues = (error as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues
      .map((issue) => `${(issue.path ?? []).join(".") || "input"}: ${issue.message ?? "invalid"}`)
      .join("\n  ");
  }
  return error instanceof Error ? error.message : String(error);
}
