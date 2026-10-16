/**
 * node.logs procedure (roadmap R44)
 *
 * The output of a process that node.spawn started. The process registry of client-shell reads
 * the output of each process and keeps its end: the last 64 KiB, stdout and stderr together.
 * So the procedure gives that end, also after the process ended (the registry keeps the records
 * of the last 50 ended processes). It knows only the processes of this host process.
 */

import type { NodeLogsInput, NodeLogsOutput } from "../../types.js";
import { processManager } from "../../process-manager.js";

// The CSI and OSC escape sequences of terminals (colors, styles, links), as client-shell removes them
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** The last `count` lines of a text. A line end at the end of the text does not count as a line. */
export function lastLines(text: string, count: number): string {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const lines = body.split("\n");
  if (lines.length <= count) return text;
  return lines.slice(-count).join("\n") + (text.endsWith("\n") ? "\n" : "");
}

/**
 * The end of the output of a process of node.spawn
 */
export async function nodeLogs(input: NodeLogsInput): Promise<NodeLogsOutput> {
  const info = processManager.get(input.processId);
  if (!info) {
    throw new Error(`node.logs: no process ${input.processId}. node.status lists the processes of node.spawn on this host.`);
  }
  let output = processManager.output(input.processId);
  if (input.stripAnsi) output = output.replace(ANSI, "");
  if (input.lines !== undefined) output = lastLines(output, input.lines);
  const result: NodeLogsOutput = { processId: info.processId, status: info.status, output };
  if (info.exitCode !== undefined) result.exitCode = info.exitCode;
  return result;
}
