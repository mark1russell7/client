/**
 * The Mermaid flowcharts of programs (roadmap R23).
 *
 * The golden flowcharts are in test/golden (`<name>.mmd`), next to the golden IR. To accept an
 * intended change, start `npx vitest run -u` in this package and review the diff of the files.
 *
 * The test has no Mermaid parser, so it examines the grammar of the lines that `toMermaid()`
 * writes: each line is a node, a subgraph, an arrow or a class, and each label has only safe
 * characters and entity codes. A property test does the same for random programs.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { makeHarness } from "../test/harness.js";
import { GOLDEN_PROGRAMS, call, ref } from "../test/golden-programs.js";
import { programArbitrary } from "../test/programs.js";
import { diagramProgram, mermaidText, toMermaid } from "./mermaid.js";
import { checkProgram } from "./program.js";

const LABEL = String.raw`(?:[A-Za-z0-9 .,_\-/+=?!'()]|#\d+;|<br/>)*`;
const NODE = new RegExp(String.raw`^\s*(n\d+)(\[\[|\(\[|\{\{|\(\(|\[|\(|\{)"${LABEL}"(\]\]|\]\)|\}\}|\)\)|\]|\)|\})$`);
const SUBGRAPH = new RegExp(String.raw`^\s*subgraph (s\d+)\["${LABEL}"\]$`);
const EDGE = new RegExp(String.raw`^  ([ns]\d+) (-->|-\.->)(?:\|"${LABEL}"\|)? ([ns]\d+)$`);
const CLOSE: Record<string, string> = { "[[": "]]", "([": "])", "{{": "}}", "((": "))", "[": "]", "(": ")", "{": "}" };

/** This function examines the grammar of a flowchart, and gives the problems. */
function grammarProblems(text: string): string[] {
  const problems: string[] = [];
  const lines = text.split("\n");
  if (!/^flowchart (TD|LR)$/.test(lines[0] ?? "")) problems.push(`the first line is ${JSON.stringify(lines[0])}`);
  if (lines[lines.length - 1] !== "") problems.push("the text does not end with a line break");
  const defined = new Set<string>();
  const edges: Array<[string, string]> = [];
  let depth = 0;
  for (const line of lines.slice(1, -1)) {
    const node = NODE.exec(line);
    const subgraph = SUBGRAPH.exec(line);
    const edge = EDGE.exec(line);
    if (node) {
      if (CLOSE[node[2]!] !== node[3]) problems.push(`the brackets of ${node[1]} do not agree`);
      if (defined.has(node[1]!)) problems.push(`${node[1]} has two definitions`);
      defined.add(node[1]!);
    } else if (subgraph) {
      defined.add(subgraph[1]!);
      depth++;
    } else if (/^\s*end$/.test(line)) {
      depth--;
      if (depth < 0) problems.push("an end without a subgraph");
    } else if (edge) {
      edges.push([edge[1]!, edge[3]!]);
    } else if (!/^  classDef [a-z]+ [a-z-]+:[^;"]+$/.test(line) && !/^  class [ns]\d+(,[ns]\d+)* [a-z]+$/.test(line)) {
      problems.push(`a line that is not Mermaid: ${JSON.stringify(line)}`);
    }
  }
  if (depth !== 0) problems.push("a subgraph without an end");
  for (const [from, to] of edges) {
    if (!defined.has(from) || !defined.has(to)) problems.push(`an arrow from ${from} to ${to} names a node that the text does not define`);
  }
  return problems;
}

/** The text of a label again: each entity code gives its character back. */
function decode(label: string): string {
  return label.replace(/#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

describe("mermaidText", () => {
  it("keeps the letters and writes quotes, brackets, < and line breaks as entity codes", () => {
    expect(mermaidText('say "hi" [x] <b>\n#1;')).toBe("say #34;hi#34; #91;x#93; #60;b#62;#10;#35;1#59;");
    expect(mermaidText("a\u2028b\u2029c")).toBe("a#8232;b#8233;c");
    expect(mermaidText("end")).toBe("end");
  });

  it("cuts a long text and ends it with three dots", () => {
    expect(mermaidText("abcdefghij", 6)).toBe("abc...");
    expect(mermaidText("\u{1F600}".repeat(10), 5)).toBe("#128512;#128512;...");
  });

  it("gives only safe characters and entity codes for each text, and the codes give the text back", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        const label = mermaidText(text, Number.POSITIVE_INFINITY);
        expect(label).toMatch(new RegExp(`^${LABEL}$`));
        expect(label).not.toContain("<br/>");
        expect(decode(label)).toBe(text);
      }),
      { numRuns: 500 },
    );
  });
});

/** More programs: the parts of the IR that the golden programs of the compiler do not have. */
const MORE_PROGRAMS: ReadonlyArray<{ name: string; program: unknown }> = [
  {
    name: "logic",
    program: call("client.or", {
      values: [call("t.truth", { value: 0 }), call("client.and", { values: [call("t.truth", { value: 1 }), false] }), call("t.num", { value: 3 })],
    }),
  },
  {
    name: "fork-and-loops",
    program: call("client.chain", {
      steps: [
        call("client.parallel", { tasks: [call("t.num", { value: 1 }), "data", []], failFast: true }),
        call("client.reduce", { items: [1], initial: call("t.num", { value: 0 }) }),
        call("client.map", { items: call("t.echo", { value: [1, 2] }) }),
        call("client.conditional", { condition: true }),
        { $ref: "$last" },
        call("client.chain", { steps: [] }),
      ],
    }),
  },
  {
    name: "labels",
    program: call("client.conditional", {
      condition: call("t.truth", { value: 'say "hi" [x] <b>\n#1; end\u2028%% comment' }),
      then: call("t.echo", { "a]\"b": 1 }, { $name: 'quote"name' }),
      else: 'say "hi" [x] {y} |z| <b>\n\u2029',
    }),
  },
  {
    name: "problems",
    program: call("client.chain", {
      steps: [call("t.echo", { value: ref("nope") }), call("t.missing", {}), call("client.map", { items: [1], fn: "not a call" })],
    }),
  },
];

describe("toMermaid", () => {
  for (const { name, program, mode } of [...GOLDEN_PROGRAMS, ...MORE_PROGRAMS] as ReadonlyArray<{ name: string; program: unknown; mode?: "exec" | "body" }>) {
    it(`${name}: the golden flowchart, with a correct grammar`, async () => {
      const harness = makeHarness();
      const result = diagramProgram(program, { facts: harness.facts(), mode });
      await expect(result.mermaid).toMatchFileSnapshot(`../test/golden/${name}.mmd`);
      expect(grammarProblems(result.mermaid)).toEqual([]);
    });
  }

  it("draws each step of a chain in order, and a dotted arrow from the step that binds a name to each use", () => {
    const harness = makeHarness();
    const { mermaid } = diagramProgram(GOLDEN_PROGRAMS[0]!.program, { facts: harness.facts() });
    const lines = mermaid.split("\n");
    const id = (label: string): string => lines.find((line) => line.includes(`"${label}"`))!.trim().split(/[[({]/)[0]!;
    const sum = id("client.add<br/>#36;name sum");
    expect(mermaid).toContain(`${sum} --> ${id("client.multiply")}`);
    expect(mermaid.match(new RegExp(`${sum} -\\.->\\|"sum"\\|`, "g"))).toHaveLength(2);
    expect(mermaid).toContain(`${id("client.multiply")} -.->|"#36;last"|`);
  });

  it("marks a dynamic call, a deferred call and a $never call", () => {
    const harness = makeHarness();
    const { mermaid } = diagramProgram(GOLDEN_PROGRAMS.find((entry) => entry.name === "deferred")!.program, { facts: harness.facts() });
    expect(mermaid).toContain('[["client.eval<br/>dynamic (it runs the refs of its input)"]]');
    expect(mermaid).toContain('"t.echo<br/>deferred (waits for #36;parent)"');
    expect(mermaid).toContain('"t.write<br/>data (#36;when #36;never)"');
    expect(mermaid).toMatch(/class n\d+(,n\d+)* deferred/);
    expect(mermaid).toMatch(/subgraph s\d+\["runs"\]/);
  });

  it("gives a node with an error the class error, and an unknown name its own node", () => {
    const harness = makeHarness();
    const result = diagramProgram(MORE_PROGRAMS.find((entry) => entry.name === "problems")!.program, { facts: harness.facts() });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["unknown-name", "unknown-procedure", "fn-not-call"]));
    expect(result.mermaid).toContain('"unknown name (nope)"');
    expect(result.mermaid).toMatch(/class n\d+(,n\d+)* error/);
  });

  it("draws from left to right on request", () => {
    const harness = makeHarness();
    const { ir } = checkProgram(GOLDEN_PROGRAMS[0]!.program, { facts: harness.facts() });
    expect(toMermaid(ir, { direction: "LR" }).split("\n")[0]).toBe("flowchart LR");
  });

  it("gives a flowchart with a correct grammar for each random program", () => {
    const harness = makeHarness();
    const facts = harness.facts();
    fc.assert(
      fc.property(programArbitrary({ depth: 3, sequentialParallel: false, store: true, missing: true }), (program) => {
        const { ir, diagnostics } = checkProgram(program, { facts });
        expect(grammarProblems(toMermaid(ir, { diagnostics }))).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });
});
