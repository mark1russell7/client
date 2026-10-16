/**
 * The procedures of `@procedures/ics`: `ics.parse`, `ics.occurrences`, `ics.write` and `ics.fetch`.
 */

import { createProcedure, zodAdapter, type AnyProcedure, type ProcedureContext } from "@procedures/client";
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
  .input(zodAdapter<ParseInput>(ParseInputSchema))
  .output(zodAdapter<EventsOutput>(EventsOutputSchema))
  .meta({
    description: "Read the events of an iCalendar text",
    output: "json",
    effects: PURE,
  })
  .handler(async (input: ParseInput): Promise<EventsOutput> => ({ events: parseIcs(input.text) }))
  .build() as AnyProcedure;

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
  .input(zodAdapter<OccurrencesInput>(OccurrencesInputSchema))
  .output(zodAdapter<OccurrencesOutput>(OccurrencesOutputSchema))
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
  .build() as AnyProcedure;

// =============================================================================
// ics.write
// =============================================================================

export const icsWriteProcedure: AnyProcedure = createProcedure()
  .path(["ics", "write"])
  .input(zodAdapter<IcsWriteInput>(IcsWriteInputSchema))
  .output(zodAdapter<IcsWriteOutput>(IcsWriteOutputSchema))
  .meta({
    description: "Write an iCalendar text from events: escaped text, folded lines and CRLF line ends",
    output: "json",
    effects: PURE,
  })
  .handler(async (input: IcsWriteInput): Promise<IcsWriteOutput> => icsWrite(input))
  .build() as AnyProcedure;

// =============================================================================
// ics.fetch
// =============================================================================

const FetchInputSchema = z.object({
  url: z.url().describe("The address of the calendar feed. A private feed address is a secret: no error repeats it."),
  timeoutMs: z.number().int().positive().max(120_000).default(20_000).describe("The time limit, in milliseconds"),
});
type FetchInput = z.infer<typeof FetchInputSchema>;

/**
 * This function gets the text of a calendar feed. The address of a private feed is a secret, so
 * an error never includes it.
 */
export async function fetchCalendar(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const signals = signal ? [signal, AbortSignal.timeout(timeoutMs)] : [AbortSignal.timeout(timeoutMs)];
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.any(signals), headers: { accept: "text/calendar, */*" } });
  } catch (error) {
    const reason = (error as { name?: string }).name === "TimeoutError" ? `no answer in ${timeoutMs} ms` : "the request failed";
    throw new Error(`The calendar feed did not answer: ${reason}`);
  }
  if (!response.ok) throw new Error(`The calendar feed gave HTTP ${response.status}`);
  const text = await response.text();
  // A proxy page or an error page with status 200 is not a calendar. Zero events from it would
  // look like an empty calendar.
  if (!isCalendar(text)) throw new Error("The calendar feed did not give an iCalendar text");
  return text;
}

export const icsFetchProcedure: AnyProcedure = createProcedure()
  .path(["ics", "fetch"])
  .input(zodAdapter<FetchInput>(FetchInputSchema))
  .output(zodAdapter<EventsOutput>(EventsOutputSchema))
  .meta({
    description: "Get a calendar feed and read its events",
    args: ["url"],
    output: "json",
    effects: { reads: ["network"], writes: [] },
  })
  .handler(async (input: FetchInput, ctx?: ProcedureContext): Promise<EventsOutput> => {
    return { events: parseIcs(await fetchCalendar(input.url, input.timeoutMs, ctx?.signal)) };
  })
  .build() as AnyProcedure;

export const icsProcedures: AnyProcedure[] = [icsParseProcedure, icsOccurrencesProcedure, icsWriteProcedure, icsFetchProcedure];
