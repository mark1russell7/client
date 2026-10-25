/**
 * Type definitions of the procedures of this package
 */

import { z } from "zod";
import type { IcsStatus } from "./write.js";

// =============================================================================
// ics.write Types - Write an iCalendar text from events
// =============================================================================

/** The input of `ics.write`: the events and the properties of the calendar. */
export interface IcsWriteInput {
  events: Array<{
    uid: string;
    start: string;
    end?: string | undefined;
    allDay?: boolean | undefined;
    summary?: string | undefined;
    location?: string | undefined;
    description?: string | undefined;
    url?: string | undefined;
    sequence?: number | undefined;
    status?: IcsStatus | undefined;
    rrule?: string | undefined;
    exdates?: string[] | undefined;
    tzid?: string | undefined;
  }>;
  prodId?: string | undefined;
  method?: string | undefined;
  calscale?: string | undefined;
  calendarName?: string | undefined;
  stamp?: string | undefined;
}

/** The output of `ics.write`: the iCalendar text, which `ics.parse` reads. */
export interface IcsWriteOutput {
  text: string;
}

const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Write an ISO 8601 time");
const token = z.string().regex(/^[A-Za-z0-9-]+$/, "Write a token: letters, digits and -");

const IcsWriteEventSchema = z.object({
  uid: z.string().min(1).describe("The UID. Keep it stable across exports"),
  start: isoTime.describe("The start (ISO 8601). For an all-day event, the date part is the date"),
  end: isoTime.optional().describe("The end (ISO 8601). For an all-day event, the end date is exclusive"),
  allDay: z.boolean().optional().describe("True for an all-day event (VALUE=DATE)"),
  summary: z.string().optional().describe("The title"),
  location: z.string().optional().describe("The place"),
  description: z.string().optional().describe("The notes"),
  url: z.url().optional().describe("A link"),
  sequence: z.number().int().min(0).optional().describe("The SEQUENCE: it increases at each change of the event"),
  status: z.enum(["TENTATIVE", "CONFIRMED", "CANCELLED"]).optional().describe("The STATUS. CANCELLED removes the event at the next import"),
  rrule: z
    .string()
    .regex(/^[A-Za-z0-9=;,+-]+$/, "Write a recurrence rule, for example FREQ=WEEKLY;COUNT=4")
    .optional()
    .describe("The recurrence rule without RRULE:, for example FREQ=YEARLY"),
  exdates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Write a date (YYYY-MM-DD)"))
    .optional()
    .describe("The dates (YYYY-MM-DD) that the recurrence skips, in the zone of tzid"),
  tzid: z.string().min(1).optional().describe("The IANA zone of the event. The writer writes each EXDATE in this zone"),
});

export const IcsWriteInputSchema: z.ZodType<IcsWriteInput> = z.object({
  events: z.array(IcsWriteEventSchema).describe("The events (VEVENT) of the calendar"),
  prodId: z.string().min(1).optional().describe("The PRODID (default: -//procedures//ics//EN)"),
  method: token.optional().describe("The METHOD, for example PUBLISH or CANCEL"),
  calscale: token.optional().describe("The CALSCALE, for example GREGORIAN"),
  calendarName: z.string().optional().describe("The name of the calendar (X-WR-CALNAME)"),
  stamp: isoTime.optional().describe("The DTSTAMP of each event (ISO 8601). The default is the current time"),
});

export const IcsWriteOutputSchema: z.ZodType<IcsWriteOutput> = z.object({
  text: z.string().describe("The iCalendar text, with CRLF line ends and folded lines"),
});
