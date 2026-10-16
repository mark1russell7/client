/**
 * node.logs procedure (roadmap R44)
 *
 * The output of a process that node.spawn started. The process registry of client-shell reads
 * the output of each process and keeps its end: the last 64 KiB, stdout and stderr together.
 * So the procedure gives that end, also after the process ended (the registry keeps the records
 * of the last 50 ended processes). It knows only the processes of this host process.
 *
 * With `follow`, the procedure gives a stream: the kept output as `output` lines, then each new
 * line of stdout and stderr, then one `exit` item at the end of the process. The stream ends at
 * the end of the process, at an abort of the caller and when the reader stops. Each end removes
 * the subscription of the stream from the process registry.
 */

import type { NodeLogItem, NodeLogsInput, NodeLogsOutput } from "../../types.js";
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

/** The lines of a text without their line ends (LF or CRLF). A line end at the end adds no line. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
  return lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/** The context that node.logs reads: the abort of the caller. */
export interface NodeLogsContext {
  signal?: AbortSignal | undefined;
}

/**
 * The end of the output of a process of node.spawn, or with `follow` a stream of its lines
 */
export async function nodeLogs(input: NodeLogsInput, ctx: NodeLogsContext = {}): Promise<NodeLogsOutput | AsyncGenerator<NodeLogItem, void, undefined>> {
  const info = processManager.get(input.processId);
  if (!info) {
    throw new Error(`node.logs: no process ${input.processId}. node.status lists the processes of node.spawn on this host.`);
  }
  if (input.follow) return followLogs(input, ctx.signal);
  let output = processManager.output(input.processId);
  if (input.stripAnsi) output = output.replace(ANSI, "");
  if (input.lines !== undefined) output = lastLines(output, input.lines);
  const result: NodeLogsOutput = { processId: info.processId, status: info.status, output };
  if (info.exitCode !== undefined) result.exitCode = info.exitCode;
  return result;
}

/** The lines of a process: the kept output, the new lines and the exit. */
async function* followLogs(input: NodeLogsInput, signal: AbortSignal | undefined): AsyncGenerator<NodeLogItem, void, undefined> {
  const clean = (line: string): string => (input.stripAnsi ? line.replace(ANSI, "") : line);
  // The start of a line that has no line end yet, for each stream
  const partial = { stdout: "", stderr: "" };
  for await (const item of processManager.follow(input.processId, { backlog: true, signal })) {
    switch (item.type) {
      case "backlog": {
        const kept = input.lines !== undefined ? lastLines(item.text, input.lines) : item.text;
        for (const line of splitLines(kept)) yield { type: "output", line: clean(line) };
        break;
      }
      case "output": {
        const lines = (partial[item.stream] + item.text).split("\n");
        partial[item.stream] = lines.pop() ?? "";
        for (const line of lines) yield { type: item.stream, line: clean(line.endsWith("\r") ? line.slice(0, -1) : line) };
        break;
      }
      case "dropped":
        yield { type: "dropped", bytes: item.bytes };
        break;
      case "end": {
        for (const stream of ["stdout", "stderr"] as const) {
          if (partial[stream] !== "") yield { type: stream, line: clean(partial[stream]) };
        }
        const exit: Extract<NodeLogItem, { type: "exit" }> = { type: "exit", status: item.info.status === "error" ? "error" : "exited" };
        if (item.info.exitCode !== undefined) exit.exitCode = item.info.exitCode;
        if (item.info.signal !== undefined) exit.signal = item.info.signal;
        yield exit;
        break;
      }
    }
  }
}
