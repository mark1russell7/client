// Two rules of the architecture that the type checker cannot see (roadmap CLI-84).
//
// Rule "path" (invariant I3, decision D36): a segment of a procedure path can have a "." or a "%".
// Only the codec of @procedures/client keeps such a segment as one segment: `encodeSegment`,
// `decodeSegment`, `segmentsToTopic`, `topicToSegments`, `pathToMethod`, `methodToPath`,
// `pathToKey`, `keyToPath`, `collectionChangeTopic` and `collectionTopicPartition`. Outside the
// files of the codec, the rule finds:
// - a call `x.join(".")` or `x.split(".")` (also `x.split(/\./)`). A `join` whose text goes
//   into a sentence (a template literal or a `+` with a text that has a space) is display text, and
//   not a key, a method or a topic, so it does not count.
// - the topic prefix "collections." as a text, a template literal or a `+` that makes a text with
//   "collections." and a value, and a regular expression with `collections\.`.
//
// Rule "write" (invariant I5, decision D39): each write to a storage collection goes through
// `MongoDocumentStorage`. The rule finds each call of a write method of the MongoDB driver
// (`insertOne`, `updateMany`, `bulkWrite`, `findOneAndUpdate` and the others of WRITE_METHODS)
// outside the files of WRITE_FILES.
//
// The check parses each tracked source file of `packages/*/src` with @babel/parser, so a comment
// or a text that looks like a call counts for nothing. The tests and the test folders do not
// count. Dots of another kind (a field path, the `$ref` of a program, an address) are not a path:
// - A file of PATH_FILES has only such dots: the rule "path" skips it.
// - One finding in another file gets a comment `path-check: <reason>` on its line or on the line
//   above it.
// Each entry of PATH_FILES and WRITE_FILES has its reason. An entry or a comment without a finding
// is stale, and it fails the check too.
//
// Start it with: node scripts/check-paths-and-writes.ts. Exit code 1 on a failure.
// The tests of the check: node --test scripts/check-paths-and-writes.test.ts.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type ParserPlugin } from "@babel/parser";
import { root } from "./lib/workspace.mjs";

/** The files of the codec (D36): the rule "path" does not examine them. */
export const CODEC_FILES: ReadonlySet<string> = new Set([
  "packages/client/src/procedures/segments.ts",
  "packages/client/src/server/method.ts",
  "packages/client/src/procedures/collection/topic.ts",
]);

/**
 * The files whose dots are not the dots of a procedure path, a key, a method or a topic. The rule
 * "path" skips them. Each entry has its reason.
 */
export const PATH_FILES: Readonly<Record<string, string>> = {
  "packages/client/src/procedures/collection/query.ts": "The field paths of a query, a sort and a patch (`lines.0.price`): the item fields, not a procedure path.",
  "packages/client/src/procedures/core/object.ts": "The dotted property path of `client.get` and `client.set`: the fields of a value.",
  "packages/client-collections/src/undo/inverse.ts": "The field paths of a patch and of its inverse: the item fields, not a procedure path.",
  "packages/http/src/address.ts": "The four numbers of an IPv4 address.",
  "packages/mcp/src/mapping/path-encoder.ts": "The MCP tool name: `sanitizePath()` changes each dot of a segment to `_` first, and a tool name cannot have the `%` of `encodeSegment()`.",
  "packages/site/src/lib/versions.ts": "The parts of a version number (`1.2.3`).",
};

/** The write methods of a MongoDB collection (the driver `mongodb`). */
export const WRITE_METHODS: ReadonlySet<string> = new Set([
  "insertOne",
  "insertMany",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "bulkWrite",
  "findOneAndUpdate",
  "findOneAndReplace",
  "findOneAndDelete",
]);

/** The files that can write a collection with the driver (D39). Each entry has its reason. */
export const WRITE_FILES: Readonly<Record<string, string>> = {
  "packages/client-mongo/src/storage/document-storage.ts": "The storage itself: the write path of `MongoDocumentStorage`, its counters and the adoption of a raw write (D39).",
  "packages/client-mongo/src/storage/materializer.ts": "The materializer of the views: it writes as the storage does when the target has the storage form (CLI-81), and it writes its own state documents.",
  "packages/client-mongo/src/storage/mongo-storage.ts": "`MongoStorage`, the simple `CollectionStorage` of `{ _id, data }` documents: it has no `_seq` and no change log.",
  "packages/client-mongo/src/procedures/documents.bulk.ts": "The procedure `mongo.documents.bulk`: a raw write that the caller asks for. The watcher adopts it on a storage collection (D39).",
  "packages/client-mongo/src/procedures/documents.delete.ts": "The procedure `mongo.documents.delete`: a raw write that the caller asks for. The watcher adopts it on a storage collection (D39).",
  "packages/client-mongo/src/procedures/documents.insert.ts": "The procedure `mongo.documents.insert`: a raw write that the caller asks for. The watcher adopts it on a storage collection (D39).",
  "packages/client-mongo/src/procedures/documents.update.ts": "The procedure `mongo.documents.update`: a raw write that the caller asks for. The watcher adopts it on a storage collection (D39).",
  "packages/signaldb/src/storage.ts": "A collection of SignalDB in the memory of the page, not a MongoDB collection.",
};

/** The rule of a finding: "path", "write", or "marker" for a comment `path-check:` without a finding. */
export type Rule = "path" | "write" | "marker";

/** One finding of a source file: its rule, its line and its text. `allowed` is the reason of a comment `path-check:`. */
export interface Finding {
  readonly rule: Rule;
  readonly line: number;
  readonly text: string;
  allowed?: string;
}

/** One source file: its path relative to the root of the repository, with `/`, and its text. */
export interface SourceFile {
  readonly file: string;
  readonly source: string;
}

/** The lists of allowed files of `problemsOf`. A list that is not set is the list of this module. */
export interface AllowedFiles {
  readonly codec?: ReadonlySet<string>;
  readonly pathFiles?: Readonly<Record<string, string>>;
  readonly writeFiles?: Readonly<Record<string, string>>;
}

/** The counts of the findings: the findings that fail, and the findings of the allowed files. */
export interface Counts {
  path: number;
  write: number;
  allowedPath: number;
  allowedWrite: number;
}

/** The result of `problemsOf`: one text for each problem, and the counts. */
export interface Problems {
  readonly problems: string[];
  readonly counts: Counts;
}

/** The location of a node or of a comment: the lines of its start and of its end, from 1. */
interface Location {
  readonly start: { readonly line: number };
  readonly end: { readonly line: number };
}

/** A node of the syntax tree of @babel/parser: its type and its location. The interfaces below give the fields of each kind. */
interface SyntaxNode {
  readonly type: string;
  readonly loc?: Location | null;
}

/** A text in quotes. */
interface StringLiteral extends SyntaxNode {
  readonly value: string;
}

/** A text part of a template literal. The parser sets `cooked` to null for an invalid escape. */
interface TemplateElement extends SyntaxNode {
  readonly value: { readonly cooked?: string | null };
}

/** A template literal: its text parts and its values. */
interface TemplateLiteral extends SyntaxNode {
  readonly quasis: readonly TemplateElement[];
  readonly expressions: readonly SyntaxNode[];
}

/** A regular expression literal: its pattern and its flags. */
interface RegExpLiteral extends SyntaxNode {
  readonly pattern: string;
  readonly flags: string;
}

/** A name. */
interface Identifier extends SyntaxNode {
  readonly name: string;
}

/** A member expression (`a.b` or `a["b"]`), also the optional form. */
interface MemberExpression extends SyntaxNode {
  readonly computed: boolean;
  readonly property: SyntaxNode;
}

/** A call or a `new`, also the optional call: the callee and the arguments. */
interface CallExpression extends SyntaxNode {
  readonly callee: SyntaxNode;
  readonly arguments: readonly SyntaxNode[];
}

/** A binary expression: its operator and its two operands. */
interface BinaryExpression extends SyntaxNode {
  readonly operator: string;
  readonly left: SyntaxNode;
  readonly right: SyntaxNode;
}

/** A comment of the parser: its text and its location. */
interface Comment {
  readonly value: string;
  readonly loc?: Location | null;
}

/** The kinds of node that the check reads, with the interface of each kind. */
interface NodeKinds {
  StringLiteral: StringLiteral;
  TemplateLiteral: TemplateLiteral;
  RegExpLiteral: RegExpLiteral;
  Identifier: Identifier;
  MemberExpression: MemberExpression;
  OptionalMemberExpression: MemberExpression;
  CallExpression: CallExpression;
  OptionalCallExpression: CallExpression;
  NewExpression: CallExpression;
  BinaryExpression: BinaryExpression;
}

/** This function tells if a node is of one of the kinds. */
function is<K extends keyof NodeKinds>(node: SyntaxNode | null | undefined, ...kinds: readonly K[]): node is NodeKinds[K] {
  return node !== null && node !== undefined && (kinds as readonly string[]).includes(node.type);
}

/** This function tells if a value of a field is a node: an object with a text `type`. */
function isNode(value: unknown): value is SyntaxNode {
  return typeof value === "object" && value !== null && typeof (value as { readonly type?: unknown }).type === "string";
}

/** This function tells if a node is a `+`. */
function isPlus(node: SyntaxNode | null | undefined): node is BinaryExpression {
  return is(node, "BinaryExpression") && node.operator === "+";
}

/** The source files: the extensions of the code. A declaration file (`.d.ts`) has no calls. */
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
/** The test files and the test folders. */
const TEST = /(?:\.(?:test|spec|bench)\.[cm]?[jt]sx?$)|(?:(?:^|\/)(?:__tests__|__mocks__|test|tests|e2e|fixtures|__fixtures__)\/)/;

/** This function tells if a tracked file is a source file that the check examines. */
export function isCheckedFile(file: string): boolean {
  return /^packages\/[^/]+\/src\//.test(file) && SOURCE.test(file) && !DECLARATION.test(file) && !TEST.test(file.slice(file.indexOf("/src/") + 1));
}

/** The plugins of the parser for a file. */
function pluginsOf(file: string): ParserPlugin[] {
  if (/\.[cm]?ts$/.test(file)) return ["typescript"];
  if (/\.tsx$/.test(file)) return ["typescript", "jsx"];
  return ["jsx"];
}

/** The keys of a node that are not child nodes. */
const SKIP_KEYS = new Set(["loc", "start", "end", "range", "extra", "comments", "leadingComments", "trailingComments", "innerComments", "tokens"]);

/** The function that `walk` calls for each node, with the list of its ancestors (the parent last). */
type Visitor = (node: SyntaxNode, ancestors: readonly SyntaxNode[]) => void;

/** This function visits each node of the tree, with the list of its ancestors (the parent last). */
function walk(node: SyntaxNode, visit: Visitor, ancestors: SyntaxNode[] = []): void {
  visit(node, ancestors);
  ancestors.push(node);
  const fields: [string, unknown][] = Object.entries(node);
  for (const [key, value] of fields) {
    if (SKIP_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value as readonly unknown[]) if (isNode(child)) walk(child, visit, ancestors);
    } else if (isNode(value)) {
      walk(value, visit, ancestors);
    }
  }
  ancestors.pop();
}

/** The name of the property of a member expression, or undefined for a computed name that is not a text. */
function propertyName(member: SyntaxNode | undefined): string | undefined {
  if (!is(member, "MemberExpression", "OptionalMemberExpression")) return undefined;
  if (!member.computed && is(member.property, "Identifier")) return member.property.name;
  if (member.computed && is(member.property, "StringLiteral")) return member.property.value;
  return undefined;
}

/** The text of a node when it is a literal text: a string or a template literal without values. */
function literalText(node: SyntaxNode | undefined): string | undefined {
  if (is(node, "StringLiteral")) return node.value;
  if (is(node, "TemplateLiteral") && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

/** True when the node is the separator ".", or for `split`, the regular expression `/\./` or `/[.]/`. */
function isDotSeparator(node: SyntaxNode | undefined, method: string): boolean {
  if (literalText(node) === ".") return true;
  return method === "split" && is(node, "RegExpLiteral") && (node.pattern === "\\." || node.pattern === "[.]") && node.flags === "";
}

/** The kinds of node that pass the value of a child on unchanged, for the test of display text. */
const PASS_THROUGH = new Set(["LogicalExpression", "ConditionalExpression", "ParenthesizedExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"]);

/** The texts of a `+` chain: its string literals and the quasis of its template literals. */
function textsOfSum(node: SyntaxNode, texts: string[] = []): string[] {
  if (isPlus(node)) {
    textsOfSum(node.left, texts);
    textsOfSum(node.right, texts);
  } else if (is(node, "StringLiteral")) {
    texts.push(node.value);
  } else if (is(node, "TemplateLiteral")) {
    for (const quasi of node.quasis) texts.push(quasi.value.cooked ?? "");
  }
  return texts;
}

/**
 * True when the value of the node goes into a sentence: a template literal, or a `+` chain, with a
 * text that has a space. A key, a method and a topic never have a space, so such a text is display
 * text, for example an error message.
 */
function isDisplayText(ancestors: readonly SyntaxNode[]): boolean {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const parent = ancestors[i];
    if (parent === undefined) return false;
    if (PASS_THROUGH.has(parent.type)) continue;
    if (is(parent, "TemplateLiteral")) return parent.quasis.some((quasi) => /\s/.test(quasi.value.cooked ?? ""));
    if (isPlus(parent)) {
      let top = i;
      while (top > 0 && isPlus(ancestors[top - 1])) top--;
      return textsOfSum(ancestors[top] ?? parent).some((text) => /\s/.test(text));
    }
    return false;
  }
  return false;
}

const TOPIC_PREFIX = "collections.";
const TOPIC_PATTERN = /collections\\\./;

/** The line of a node. A method call has the line of its method name: in a chain of calls, the line of `.join(".")`. */
function lineOf(node: SyntaxNode): number {
  const at = is(node, "CallExpression", "OptionalCallExpression", "NewExpression") && is(node.callee, "MemberExpression", "OptionalMemberExpression") ? node.callee.property : node;
  const line = at.loc?.start.line;
  if (line === undefined) throw new Error(`the parser gave no location for a node ${at.type}`);
  return line;
}

/**
 * The findings of one source file: `{ rule, line, text }`, where `rule` is "path" or "write".
 * The `file` is the path relative to the root of the repository, with `/`. It selects the parser
 * plugins. The lists of allowed files do not apply here: `problemsOf` applies them.
 */
export function findingsOf(file: string, source: string): Finding[] {
  const ast = parse(source, { sourceType: "module", plugins: pluginsOf(file), errorRecovery: false });
  const findings: Finding[] = [];
  const markers = markersOf(ast.comments ?? []);
  const add = (rule: Rule, node: SyntaxNode, text: string): void => {
    findings.push({ rule, line: lineOf(node), text });
  };
  walk(ast.program, (node, ancestors) => {
    const parent: SyntaxNode | undefined = ancestors[ancestors.length - 1];
    if (is(node, "CallExpression", "OptionalCallExpression")) {
      const method = propertyName(node.callee);
      if ((method === "join" || method === "split") && isDotSeparator(node.arguments[0], method)) {
        if (method === "split" || !isDisplayText(ancestors)) add("path", node, `${method}(".") of a path, a key, a method or a topic: use the codec of @procedures/client`);
      } else if (method !== undefined && WRITE_METHODS.has(method)) {
        add("write", node, `${method}() writes a collection outside the storage: use MongoDocumentStorage`);
      }
      if (is(node.callee, "Identifier") && node.callee.name === "RegExp" && TOPIC_PATTERN.test(literalText(node.arguments[0]) ?? "")) {
        add("path", node, "a regular expression of a topic: use collectionTopicPartition()");
      }
    } else if (is(node, "NewExpression") && is(node.callee, "Identifier") && node.callee.name === "RegExp") {
      const text = literalText(node.arguments[0]) ?? "";
      if (TOPIC_PATTERN.test(text) || text.includes("collections\\.")) add("path", node, "a regular expression of a topic: use collectionTopicPartition()");
    } else if (is(node, "RegExpLiteral")) {
      if (TOPIC_PATTERN.test(node.pattern)) add("path", node, "a regular expression of a topic: use collectionTopicPartition()");
    } else if (is(node, "StringLiteral")) {
      // The prefix alone only makes or reads a topic by hand. A `+` with it is the next case.
      if (node.value === TOPIC_PREFIX && !isPlus(parent)) add("path", node, `the topic prefix "${TOPIC_PREFIX}": use collectionChangeTopic() or collectionTopicPartition()`);
    } else if (is(node, "TemplateLiteral") && node.expressions.length > 0) {
      if (node.quasis.some((quasi) => (quasi.value.cooked ?? "").includes(TOPIC_PREFIX)) && !node.quasis.some((quasi) => /\s/.test(quasi.value.cooked ?? ""))) {
        add("path", node, `a topic made by hand ("${TOPIC_PREFIX}" and a value): use collectionChangeTopic()`);
      }
    } else if (isPlus(node) && !isPlus(parent)) {
      const texts = textsOfSum(node);
      if (texts.some((text) => text.includes(TOPIC_PREFIX)) && !texts.some((text) => /\s/.test(text))) {
        add("path", node, `a topic made by hand ("${TOPIC_PREFIX}" and a value): use collectionChangeTopic()`);
      }
    }
  });
  findings.sort((a, b) => a.line - b.line);
  // A comment `path-check: <reason>` allows the findings of the rule "path" on its line and on the next line
  const used = new Set<number>();
  for (const finding of findings) {
    if (finding.rule !== "path") continue;
    const line = [finding.line, finding.line - 1].find((at) => markers.has(at));
    if (line === undefined) continue;
    finding.allowed = markers.get(line);
    used.add(line);
  }
  for (const [line] of markers) {
    if (!used.has(line)) findings.push({ rule: "marker", line, text: `the comment "${MARKER}" allows no finding on its line or on the next line: remove it` });
  }
  return findings;
}

const MARKER = "path-check:";

/** The comments `path-check: <reason>`: the last line of each comment, and its reason. A comment without a reason does not count. */
function markersOf(comments: readonly Comment[]): Map<number, string> {
  const markers = new Map<number, string>();
  for (const comment of comments) {
    const at = comment.value.indexOf(MARKER);
    if (at === -1) continue;
    const reason = comment.value.slice(at + MARKER.length).trim();
    const line = comment.loc?.end.line;
    if (reason !== "" && line !== undefined) markers.set(line, reason);
  }
  return markers;
}

/**
 * The problems of a set of files. Each file is `{ file, source }`, with `file` relative to the root.
 * `allowed` gives the lists (by default the lists of this module). Each problem is one text:
 * `<file>:<line>: <rule>: <text>`, or a text for a stale entry or a file that does not parse.
 */
export function problemsOf(files: readonly SourceFile[], allowed: AllowedFiles = {}): Problems {
  const codec = allowed.codec ?? CODEC_FILES;
  const pathFiles = allowed.pathFiles ?? PATH_FILES;
  const writeFiles = allowed.writeFiles ?? WRITE_FILES;
  const problems: string[] = [];
  const counts: Counts = { path: 0, write: 0, allowedPath: 0, allowedWrite: 0 };
  const used = { path: new Set<string>(), write: new Set<string>() };
  for (const { file, source } of files) {
    let findings: Finding[];
    try {
      findings = findingsOf(file, source);
    } catch (error) {
      problems.push(`${file}: the parser cannot read the file: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const finding of findings) {
      if (finding.rule === "path" && codec.has(file)) continue;
      if (finding.allowed !== undefined) {
        counts.allowedPath++;
        continue;
      }
      if (finding.rule === "marker") {
        problems.push(`${file}:${finding.line}: ${finding.text}`);
        continue;
      }
      if (finding.rule === "path" && Object.hasOwn(pathFiles, file)) {
        used.path.add(file);
        counts.allowedPath++;
        continue;
      }
      if (finding.rule === "write" && Object.hasOwn(writeFiles, file)) {
        used.write.add(file);
        counts.allowedWrite++;
        continue;
      }
      counts[finding.rule]++;
      problems.push(`${file}:${finding.line}: ${finding.rule}: ${finding.text}`);
    }
  }
  const checked = new Set(files.map(({ file }) => file));
  const lists: readonly (readonly ["path" | "write", Readonly<Record<string, string>>, string])[] = [
    ["path", pathFiles, "PATH_FILES"],
    ["write", writeFiles, "WRITE_FILES"],
  ];
  for (const [rule, list, name] of lists) {
    for (const file of Object.keys(list)) {
      if (!checked.has(file)) problems.push(`${name}: ${file} is not a checked source file: remove the entry`);
      else if (!used[rule].has(file)) problems.push(`${name}: ${file} has no finding of the rule "${rule}": remove the entry`);
    }
  }
  return { problems, counts };
}

/** The tracked source files of the packages, with their text. */
export function trackedFiles(): SourceFile[] {
  return execFileSync("git", ["ls-files", "--", "packages"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((file) => file !== "" && isCheckedFile(file) && existsSync(join(root, file)))
    .map((file) => ({ file, source: readFileSync(join(root, file), "utf8") }));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const files = trackedFiles();
  const { problems, counts } = problemsOf(files);
  if (problems.length > 0) {
    console.error(`${problems.length} problems:\n  ${problems.join("\n  ")}`);
    console.error("A path, a key, a method or a topic goes through the codec (packages/documentation/ARCHITECTURE.md#i3-paths-and-topics).");
    console.error("A write to a storage collection goes through MongoDocumentStorage (packages/documentation/ARCHITECTURE.md#i5-storage-writes).");
    console.error("For dots of another kind, or for a collection that is not a storage, add the file to PATH_FILES or WRITE_FILES with its reason.");
    process.exit(1);
  }
  console.log(`${files.length} source files: no path or topic made by hand, and no raw write outside the storage (${counts.allowedPath} allowed dots and ${counts.allowedWrite} allowed writes in the listed files).`);
}
