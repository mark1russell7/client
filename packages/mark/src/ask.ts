/**
 * Questions for missing arguments.
 *
 * When a person runs mark in a terminal and a required argument is missing, mark asks for it:
 * the question shows the name, the type and the description of the field. mark does not ask
 * when stdin or stdout is not a terminal, when the environment variable CI is set, with
 * `--no-input`, or when the procedure sets `interactive: false` in its CLI metadata. Then a
 * missing argument is an error of the input, as before.
 *
 * The code is in `@procedures/cli-kit` (roadmap O61).
 */

export {
  askMissing,
  canAsk,
  missingFields,
  processTerminal,
  questionOf,
  terminalAsker,
  type Answer,
  type Asked,
  type Asker,
  type Terminal,
} from "@procedures/cli-kit";
