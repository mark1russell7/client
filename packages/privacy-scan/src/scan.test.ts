import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { privacyScanModule, registerPrivacyScanProcedures } from "./module.js";
import { privacyScanProcedures } from "./procedures.js";
import { COORDINATE_PATTERN, EMAIL_PATTERN, PHONE_PATTERN, maskMatch, readTermList, scanFiles, scanText } from "./scan.js";

// All the data of these tests is made up: 555-01xx numbers, the top-level domain .zz (not in use),
// made-up names and places.

const temps: string[] = [];
afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});
const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "privacy-scan-test-"));
  temps.push(dir);
  return dir;
};

const TEXT = [
  "Contact Ada Example at someone@mailhost.zz or +15555550100.",
  "The office is in Fooville, at 12.3456, -65.4321.",
  "Call (555) 555-0123 or 555.555.0199.",
].join("\n");

describe("scanText", () => {
  it("finds the terms, the email addresses, the phone numbers and the coordinates, in text order", () => {
    expect(scanText(TEXT, { terms: ["Ada Example", "Fooville"] })).toEqual([
      { kind: "term", line: 1, column: 9, match: "Ada Example" },
      { kind: "email", line: 1, column: 24, match: "someone@mailhost.zz" },
      { kind: "phone", line: 1, column: 47, match: "+15555550100" },
      { kind: "term", line: 2, column: 18, match: "Fooville" },
      { kind: "coordinate", line: 2, column: 31, match: "12.3456, -65.4321" },
      { kind: "phone", line: 3, column: 6, match: "(555) 555-0123" },
      { kind: "phone", line: 3, column: 24, match: "555.555.0199" },
    ]);
  });

  it("matches a term in each case, and only as a whole word", () => {
    const found = (text: string): string[] => scanText(text, { terms: ["Fooville"] }).map((f) => f.match);
    expect(found("FOOVILLE and fooville")).toEqual(["FOOVILLE", "fooville"]);
    expect(found("Foovilles xFooville Fooville2")).toEqual([]);
    expect(found("(Fooville) Fooville-North")).toEqual(["Fooville", "Fooville"]);
  });

  it("matches a term without letters at its ends anywhere, and reads a term as plain text", () => {
    expect(scanText("x#tag!y", { terms: ["#tag!"] }).map((f) => f.column)).toEqual([2]);
    expect(scanText("axb a.b", { terms: ["a.b"] }).map((f) => f.match)).toEqual(["a.b"]);
  });

  it("ignores empty terms, and reports a term only once when the list repeats it", () => {
    expect(scanText("Fooville", { terms: ["", "  ", "Fooville", "fooville ", " FOOVILLE"] })).toHaveLength(1);
  });

  it("does not report the values of the allow list, for each kind", () => {
    const allow = ["fooville", "SOMEONE@MAILHOST.ZZ", "+15555550100", "12.3456, -65.4321", " (555) 555-0123 "];
    expect(scanText(TEXT, { terms: ["Ada Example", "Fooville"], allow }).map((f) => f.match)).toEqual(["Ada Example", "555.555.0199"]);
  });

  it("does not report the addresses of the example domains", () => {
    const text = "a@example.com b@mail.example.org c@x.test d@y.invalid e@mail.localhost f@example.net g@realhost.zz";
    expect(scanText(text).map((f) => f.match)).toEqual(["g@realhost.zz"]);
  });

  it("finds only the kinds of the option kinds", () => {
    expect(scanText(TEXT, { terms: ["Fooville"], kinds: ["term", "coordinate"] }).map((f) => f.kind)).toEqual(["term", "coordinate"]);
    expect(scanText(TEXT, { terms: ["Fooville"], kinds: [] })).toEqual([]);
  });

  it("masks the matches with the option mask", () => {
    expect(scanText("mail someone@mailhost.zz", { mask: true })).toEqual([{ kind: "email", line: 1, column: 6, match: "s******************" }]);
  });

  it("counts the lines of a text with CRLF", () => {
    expect(scanText("first\r\nsecond Fooville\r\n", { terms: ["Fooville"] })).toEqual([{ kind: "term", line: 2, column: 8, match: "Fooville" }]);
  });

  it("finds a term in each case also with letters outside ASCII (the quick check before the pattern)", () => {
    const text = ["ÉLODIE wrote", "élodie wrote", "Élodie wrote", "elodie wrote", "STRAßE 1", "strasse 2"].join("\n");
    const found = scanText(text, { terms: ["Élodie", "Straße"], kinds: ["term"] });
    expect(found.map((f) => [f.line, f.match])).toEqual([
      [1, "ÉLODIE"],
      [2, "élodie"],
      [3, "Élodie"],
      [5, "STRAßE"],
    ]);
  });

  it("finds nothing in a text without private data", () => {
    expect(scanText("Version 1.2.3 of the build, at 10:30 on line 42.")).toEqual([]);
  });
});

describe("maskMatch and the patterns", () => {
  it("keeps the first character of the match", () => {
    expect(maskMatch("")).toBe("");
    expect(maskMatch("a")).toBe("*");
    expect(maskMatch("abc")).toBe("a**");
    expect(maskMatch("😀ab")).toBe("😀**");
  });

  it("gives patterns that the caller can use with matchAll", () => {
    expect([..."x someone@mailhost.zz y".matchAll(EMAIL_PATTERN)].map((m) => m[0])).toEqual(["someone@mailhost.zz"]);
    expect([..."+15555550100".matchAll(PHONE_PATTERN)]).toHaveLength(1);
    expect([..."1.23456,2.34567".matchAll(COORDINATE_PATTERN)]).toHaveLength(1);
  });
});

describe("scanFiles", () => {
  it("scans files and folders, without the skipped folders, links, binary files and repeated paths", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "sub"));
    await mkdir(join(dir, "node_modules"));
    await mkdir(join(dir, ".git"));
    await mkdir(join(dir, "outside"));
    await writeFile(join(dir, "a.txt"), "Ada Example lives here\n");
    await writeFile(join(dir, "sub", "b.md"), "﻿someone@mailhost.zz\n");
    await writeFile(join(dir, "node_modules", "c.txt"), "Ada Example\n");
    await writeFile(join(dir, ".git", "d"), "Ada Example\n");
    await writeFile(join(dir, "image.bin"), Buffer.from([0x41, 0x00, 0x42]));
    await writeFile(join(dir, "outside", "e.txt"), "Ada Example\n");
    const scanned = join(dir, "scanned");
    await mkdir(scanned);
    await writeFile(join(scanned, "f.txt"), "no private data\n");
    // A junction needs no rights on Windows. Elsewhere the type is ignored and the call makes a link.
    await symlink(join(dir, "outside"), join(scanned, "link"), "junction");
    const result = await scanFiles([join(dir, "a.txt"), dir, join(dir, "sub")], { terms: ["Ada Example"] });
    expect(result.findings).toEqual([
      { file: join(dir, "a.txt"), kind: "term", line: 1, column: 1, match: "Ada Example" },
      { file: join(dir, "outside", "e.txt"), kind: "term", line: 1, column: 1, match: "Ada Example" },
      { file: join(dir, "sub", "b.md"), kind: "email", line: 1, column: 1, match: "someone@mailhost.zz" },
    ]);
    expect(result.skipped).toEqual([join(dir, "image.bin")]);
    expect(result.files).toBe(4);

    // The scan does not follow the link to "outside"
    expect(await scanFiles([scanned], { terms: ["Ada Example"] })).toEqual({ findings: [], files: 1, skipped: [] });
  });

  it("masks the matches of files, and refuses a missing path", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "a.txt"), "Call +15555550100\n");
    expect((await scanFiles([join(dir, "a.txt")], { mask: true })).findings).toEqual([
      { file: join(dir, "a.txt"), kind: "phone", line: 1, column: 6, match: "+***********" },
    ]);
    await expect(scanFiles([join(dir, "missing.txt")])).rejects.toThrow(/ENOENT/);
  });
});

describe("readTermList", () => {
  it("reads one entry on each line, without comments and empty lines", async () => {
    const file = join(await tempDir(), "terms.txt");
    await writeFile(file, "# private terms\r\nAda Example\r\n\r\n  Fooville  \n#another comment\n");
    expect(await readTermList(file)).toEqual(["Ada Example", "Fooville"]);
  });

  it("gives an empty list for a missing optional file, and an error for a missing file", async () => {
    const dir = await tempDir();
    expect(await readTermList(join(dir, "none.txt"), { optional: true })).toEqual([]);
    await expect(readTermList(join(dir, "none.txt"))).rejects.toThrow(/ENOENT/);
    await expect(readTermList(dir, { optional: true })).rejects.toThrow();
  });
});

describe("the procedures", () => {
  const registry = new ProcedureRegistry();
  registerPrivacyScanProcedures(registry);
  const call = async (name: string, input: unknown): Promise<unknown> =>
    outputValue(await invokePath(["privacyScan", name], input, { registry }), ["privacyScan", name]);

  it("declare their effects: privacyScan.text is pure, privacyScan.files reads files", () => {
    expect(privacyScanModule.procedures).toHaveLength(2);
    const effects = Object.fromEntries(privacyScanProcedures.map((p) => [p.path.join("."), p.metadata.effects]));
    expect(effects).toEqual({
      "privacyScan.text": { reads: [], writes: [] },
      "privacyScan.files": { reads: ["fs"], writes: [] },
    });
  });

  it("privacyScan.text scans a text", async () => {
    expect(await call("text", { text: TEXT, terms: ["Fooville"], kinds: ["term"], mask: true })).toEqual({
      findings: [{ kind: "term", line: 2, column: 18, match: "F*******" }],
    });
    await expect(call("text", { text: TEXT, kinds: ["name"] })).rejects.toThrow();
  });

  it("privacyScan.files adds the terms and the allowed values of the list files", async () => {
    const dir = await tempDir();
    const code = join(dir, "code");
    await mkdir(code);
    await writeFile(join(code, "a.ts"), 'const town = "Fooville"; // owner: Ada Example, +15555550100\n');
    const termsFile = join(dir, "terms.txt");
    const allowFile = join(dir, "allow.txt");
    await writeFile(termsFile, "# terms\nFooville\nAda Example\n");
    await writeFile(allowFile, "Ada Example\n");
    const output = await call("files", { paths: [code], termsFile, allowFile, allow: ["+15555550100"] });
    expect(output).toEqual({
      findings: [{ file: join(code, "a.ts"), kind: "term", line: 1, column: 15, match: "Fooville" }],
      files: 1,
      skipped: [],
    });
    const plain = (await call("files", { paths: [code], terms: ["Ada Example"] })) as { findings: Array<{ kind: string }> };
    expect(plain.findings.map((f) => f.kind)).toEqual(["term", "phone"]);
    await expect(call("files", { paths: [] })).rejects.toThrow();
  });
});
