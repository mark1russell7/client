/**
 * The procedures of `@procedures/privacy-scan`: `privacyScan.text` (pure) and
 * `privacyScan.files` (it reads files). Both change nothing.
 */

import { createProcedure, zodAdapter, type AnyProcedure } from "@procedures/client";
import { z } from "zod";
import { FINDING_KINDS, readTermList, scanFiles, scanText, type Finding, type FileScan, type FindingKind } from "./scan.js";

const kindSchema = z.enum(FINDING_KINDS as [FindingKind, ...FindingKind[]]);

const optionFields = {
  terms: z.array(z.string()).optional().describe("The private terms (names, places, accounts). The match ignores case and finds only whole words."),
  allow: z.array(z.string()).optional().describe("The values that are not private. The match ignores case."),
  kinds: z.array(kindSchema).optional().describe("The kinds to find: term, email, phone, coordinate (default: all)"),
  mask: z.boolean().optional().describe("Show only the first character of each match (default: false)"),
};

const findingFields = {
  kind: kindSchema,
  line: z.number().int(),
  column: z.number().int(),
  match: z.string(),
};

// privacyScan.text

const TextInputSchema = z.object({
  text: z.string().describe("The text to scan"),
  ...optionFields,
});
type TextInput = z.infer<typeof TextInputSchema>;

interface TextOutput {
  /** The findings, in text order. */
  findings: Finding[];
}
const TextOutputSchema = z.object({ findings: z.array(z.object(findingFields)) });

export const privacyScanTextProcedure: AnyProcedure = createProcedure()
  .path(["privacyScan", "text"])
  .input(zodAdapter<TextInput>(TextInputSchema))
  .output(zodAdapter<TextOutput>(TextOutputSchema))
  .meta({
    description: "Find private data in a text: terms of a list, email addresses, phone numbers, coordinates",
    args: ["text"],
    output: "json",
    effects: { reads: [], writes: [] },
  })
  .handler(async (input: TextInput): Promise<TextOutput> => ({
    findings: scanText(input.text, { terms: input.terms, allow: input.allow, kinds: input.kinds, mask: input.mask }),
  }))
  .build() as AnyProcedure;

// privacyScan.files

const FilesInputSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).describe("The files and folders to scan. A folder gives all its files."),
  ...optionFields,
  termsFile: z.string().min(1).optional().describe("A file with more terms, one on each line. A line that starts with # is a comment."),
  allowFile: z.string().min(1).optional().describe("A file with more allowed values, in the format of termsFile"),
});
type FilesInput = z.infer<typeof FilesInputSchema>;

const FilesOutputSchema = z.object({
  findings: z.array(z.object({ file: z.string(), ...findingFields })),
  files: z.number().int(),
  skipped: z.array(z.string()),
});

export const privacyScanFilesProcedure: AnyProcedure = createProcedure()
  .path(["privacyScan", "files"])
  .input(zodAdapter<FilesInput>(FilesInputSchema))
  .output(zodAdapter<FileScan>(FilesOutputSchema))
  .meta({
    description: "Find private data in files and folders: terms of a list, email addresses, phone numbers, coordinates",
    args: ["paths"],
    output: "json",
    effects: { reads: ["fs"], writes: [] },
  })
  .handler(async (input: FilesInput): Promise<FileScan> => {
    const terms = [...(input.terms ?? []), ...(input.termsFile === undefined ? [] : await readTermList(input.termsFile))];
    const allow = [...(input.allow ?? []), ...(input.allowFile === undefined ? [] : await readTermList(input.allowFile))];
    return scanFiles(input.paths, { terms, allow, kinds: input.kinds, mask: input.mask });
  })
  .build() as AnyProcedure;

export const privacyScanProcedures: AnyProcedure[] = [privacyScanTextProcedure, privacyScanFilesProcedure];
