/**
 * The procedures of `@procedures/ics`: `ics.parse`, `ics.occurrences`, `ics.write` and `ics.fetch`.
 *
 * `ics.fetch` sends its request with the `fetch` of the module. The default is the global
 * `fetch`, so the root stays safe for a browser. A Node host that takes calls from others gives
 * `createHostFetch()` of `@procedures/http` to `createIcsModule()`. Then the host policy refuses a
 * feed on a loopback, private or link-local address (audit pass 2, O55).
 */

import { InvocationError, createProcedure, type AnyProcedure, type ProcedureContext } from "@procedures/client/browser";
import { z } from "zod";
import { calendarOccurrences, isCalendar, parseIcs, type IcsEvent, type Occurrence } from "./ics.js";
import { icsWrite } from "./procedures/ics/write.js";
import { IcsWriteInputSchema, IcsWriteOutputSchema, type IcsWriteInput, type IcsWriteOutput } from "./types.js";

const PURE = { reads: [], writes: [] };

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Write an ISO 8601 time");

const eventSchema = z.object({
  uid: z.string(),
  summary: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  rrule: z.string().optional(),
  location: z.string().optional(),
  exdates: z.array(z.string()).optional(),
  tzid: z.string().optional(),
  recurrenceId: z.string().optional(),
  sequence: z.number().optional(),
  lastModified: z.string().optional(),
});

const occurrenceSchema = z.object({
  uid: z.string(),
  summary: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  location: z.string().optional(),
});

// =============================================================================
// ics.parse
// =============================================================================

const ParseInputSchema = z.object({
  text: z.string().describe("The iCalendar text (BEGIN:VCALENDAR ... END:VCALENDAR)"),
});
type ParseInput = z.infer<typeof ParseInputSchema>;
interface EventsOutput {
  events: IcsEvent[];
}
const EventsOutputSchema = z.object({ events: z.array(eventSchema) });

export const icsParseProcedure: AnyProcedure = createProcedure()
  .path(["ics", "parse"])
  .input(ParseInputSchema)
  .output<EventsOutput>(EventsOutputSchema)
  .meta({
    description: "Read the events of an iCalendar text",
    output: "json",
    effects: PURE,
  })
  .handler(async (input: ParseInput): Promise<EventsOutput> => ({ events: parseIcs(input.text) }))
  .build();

// =============================================================================
// ics.occurrences
// =============================================================================

const OccurrencesInputSchema = z.object({
  text: z.string().describe("The iCalendar text"),
  from: isoTime.describe("The start of the window (ISO 8601)"),
  to: isoTime.describe("The end of the window (ISO 8601)"),
});
type OccurrencesInput = z.infer<typeof OccurrencesInputSchema>;
interface OccurrencesOutput {
  occurrences: Occurrence[];
}
const OccurrencesOutputSchema = z.object({ occurrences: z.array(occurrenceSchema) });

export const icsOccurrencesProcedure: AnyProcedure = createProcedure()
  .path(["ics", "occurrences"])
  .input(OccurrencesInputSchema)
  .output(OccurrencesOutputSchema)
  .meta({
    description: "Give the occurrences of the events of an iCalendar text in a time window, recurrences included",
    output: "json",
    effects: PURE,
  })
  .handler(
    async (input: OccurrencesInput): Promise<OccurrencesOutput> => ({
      occurrences: calendarOccurrences(parseIcs(input.text), { from: input.from, to: input.to }),
    })
  )
  .build();

// =============================================================================
// ics.write
// =============================================================================

export const icsWriteProcedure: AnyProcedure = createProcedure()
  .path(["ics", "write"])
  .input(IcsWriteInputSchema)
  .output(IcsWriteOutputSchema)
  .meta({
    description: "Write an iCalendar text from events: escaped text, folded lines and CRLF line ends",
    output: "json",
    effects: PURE,
  })
  .handler(async (input: IcsWriteInput): Promise<IcsWriteOutput> => icsWrite(input))
  .build();

// =============================================================================
// ics.fetch
// =============================================================================

const FetchInputSchema = z.object({
  url: z.url().describe("The address of the calendar feed. A private feed address is a secret: no error repeats it."),
  timeoutMs: z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds"),
});
type FetchInput = z.infer<typeof FetchInputSchema>;

/** The part of `fetch` that `fetchCalendar` uses. A test or a host gives its own with the option `fetch`. */
export type FetchText = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * The system error code of a failed request (`ECONNREFUSED`, `ENOTFOUND`, `UND_ERR_SOCKET`), or
 * undefined. The `fetch` of Node puts it in the field `cause` of its `TypeError`. The function
 * gives only a code of capital letters, digits and underscores, never a message, because a
 * message can include the secret address.
 */
function errorCodeOf(error: unknown): string | undefined {
  for (const each of [(error as { cause?: unknown } | null)?.cause, error]) {
    const code = (each as { code?: unknown } | null | undefined)?.code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)) return code;
  }
  return undefined;
}

/**
 * This function gets the text of a calendar feed. The address of a private feed is a secret, so
 * an error never includes it. An error of the request includes its system error code. The option
 * `fetch` replaces the global `fetch`.
 */
export async function fetchCalendar(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  options: { readonly fetch?: FetchText | undefined } = {}
): Promise<string> {
  const signals = signal ? [signal, AbortSignal.timeout(timeoutMs)] : [AbortSignal.timeout(timeoutMs)];
  const fetchText: FetchText = options.fetch ?? fetch;
  let response: Awaited<ReturnType<FetchText>>;
  try {
    response = await fetchText(url, { signal: AbortSignal.any(signals), headers: { accept: "text/calendar, */*" } });
  } catch (error) {
    // A refusal of the host policy keeps its code and its reason. Its message can name the
    // address of a redirect, so the new message does not.
    if (error instanceof InvocationError && error.code === "FORBIDDEN") {
      throw new InvocationError("FORBIDDEN", "The host policy does not allow the host of the calendar feed or of its redirect", error.path, error.reason);
    }
    const code = errorCodeOf(error);
    const reason =
      (error as { name?: string }).name === "TimeoutError" ? `no answer in ${timeoutMs} ms` : `the request failed${code === undefined ? "" : ` (${code})`}`;
    throw new Error(`The calendar feed did not answer: ${reason}`);
  }
  if (!response.ok) throw new Error(`The calendar feed gave HTTP ${response.status}`);
  const text = await response.text();
  // A proxy page or an error page with status 200 is not a calendar. Zero events from it would
  // look like an empty calendar.
  if (!isCalendar(text)) throw new Error("The calendar feed did not give an iCalendar text");
  return text;
}

/** The settings of the host for the procedures of this package. The procedure input cannot change them. */
export interface IcsProceduresOptions {
  /**
   * The function that sends the request of `ics.fetch`. The default is the global `fetch`. A Node
   * host gives `createHostFetch()` of `@procedures/http`.
   */
  readonly fetch?: FetchText | undefined;
}

function fetchProcedure(fetch: FetchText | undefined): AnyProcedure {
  return createProcedure()
    .path(["ics", "fetch"])
    .input(FetchInputSchema)
    .output<EventsOutput>(EventsOutputSchema)
    .meta({
      description: "Get a calendar feed and read its events",
      args: ["url"],
      output: "json",
      effects: { reads: ["network"], writes: [] },
    })
    .handler(async (input: FetchInput, ctx?: ProcedureContext): Promise<EventsOutput> => {
      return { events: parseIcs(await fetchCalendar(input.url, input.timeoutMs, ctx?.signal, { fetch })) };
    })
    .build();
}

export const icsFetchProcedure: AnyProcedure = fetchProcedure(undefined);

export const icsProcedures: AnyProcedure[] = [icsParseProcedure, icsOccurrencesProcedure, icsWriteProcedure, icsFetchProcedure];

/**
 * This function gives the procedures of this package with the settings of the host. Without a
 * `fetch`, it gives `icsProcedures`.
 */
export function createIcsProcedures(options: IcsProceduresOptions = {}): AnyProcedure[] {
  if (options.fetch === undefined) return icsProcedures;
  return [icsParseProcedure, icsOccurrencesProcedure, icsWriteProcedure, fetchProcedure(options.fetch)];
}
