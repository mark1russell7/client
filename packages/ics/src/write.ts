/**
 * An iCalendar (RFC 5545) writer: a VCALENDAR text from a list of events. It has no dependencies.
 * The reader of this package (`parseIcs`) reads the text back to the same events.
 *
 * The writer obeys these rules of RFC 5545:
 *
 * - It escapes the backslash, the semicolon, the comma and the line break of a TEXT value (3.3.11).
 * - It folds each content line at 75 octets of UTF-8, with CRLF and one space (3.1). A fold does
 *   not divide a character of more than one octet.
 * - Each line ends with CRLF.
 */

/** The STATUS of an event (RFC 5545 3.8.1.11). */
export type IcsStatus = "TENTATIVE" | "CONFIRMED" | "CANCELLED";

/** One event (one VEVENT) for `writeIcs`. An `IcsEvent` of `parseIcs` is also a correct value. */
export interface IcsWriteEvent {
  /** The UID. It identifies the event across exports, so keep it stable. */
  readonly uid: string;
  /**
   * The start, as an ISO 8601 time. The writer writes it in UTC. For an all-day event, the writer
   * uses the date part (`YYYY-MM-DD`) of the text, without a change of zone.
   */
  readonly start: string;
  /** The end. Without it, the event has no DTEND. For an all-day event, the end date is exclusive. */
  readonly end?: string | undefined;
  /** True for an all-day event: DTSTART and DTEND get `VALUE=DATE`. */
  readonly allDay?: boolean | undefined;
  readonly summary?: string | undefined;
  readonly location?: string | undefined;
  readonly description?: string | undefined;
  /** An absolute URL. The writer refuses a URL with a space or a control character. */
  readonly url?: string | undefined;
  /** The SEQUENCE: a number that increases at each change of the event. */
  readonly sequence?: number | undefined;
  /** The STATUS. A calendar removes an event with `CANCELLED` at the next import. */
  readonly status?: IcsStatus | undefined;
  /** The recurrence rule (`RRULE`) without the property name, for example `FREQ=WEEKLY;COUNT=4`. */
  readonly rrule?: string | undefined;
  /** The dates (`YYYY-MM-DD`) that the recurrence skips (`EXDATE`). */
  readonly exdates?: readonly string[] | undefined;
}

/** The properties of the calendar (VCALENDAR). The writer always writes `VERSION:2.0`. */
export interface IcsCalendarOptions {
  /** The PRODID: the product that made the calendar. The default is `-//procedures//ics//EN`. */
  readonly prodId?: string | undefined;
  /** The METHOD, for example `PUBLISH` or `CANCEL`. Without it, the calendar has no METHOD. */
  readonly method?: string | undefined;
  /** The CALSCALE, for example `GREGORIAN`. Without it, the calendar has no CALSCALE. */
  readonly calscale?: string | undefined;
  /** The name of the calendar (`X-WR-CALNAME`). */
  readonly calendarName?: string | undefined;
  /** The DTSTAMP of each event, as an ISO 8601 time. The default is the current time. */
  readonly stamp?: string | undefined;
}

/** The PRODID when the caller gives none. */
export const DEFAULT_PRODID = "-//procedures//ics//EN";

/** The maximum length of a content line, in octets, without the CRLF (RFC 5545 3.1). */
export const MAX_LINE_OCTETS = 75;

const STATUSES: ReadonlySet<string> = new Set(["TENTATIVE", "CONFIRMED", "CANCELLED"]);
const TOKEN = /^[A-Za-z0-9-]+$/;
const RRULE = /^[A-Za-z0-9=;,+-]+$/;
// A URI has no space and no control character (RFC 3986)
const UNSAFE_URI = /[\u0000- \u007f]/;

/**
 * This function encodes a TEXT value (RFC 5545 3.3.11). It escapes `\`, `;`, `,` and each line
 * break (CRLF, CR or LF) as `\n`. It removes the other control characters, but not the tab.
 */
export const escapeText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");

/** The number of UTF-8 octets of one code point. A lone surrogate becomes U+FFFD (3 octets). */
const octets = (char: string): number => {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
};

/**
 * This function folds one content line (RFC 5545 3.1). Each part has 75 octets of UTF-8 or
 * fewer, and the parts join with CRLF and one space. The space counts in the 75 octets of its
 * line. A fold does not divide a character.
 */
export const foldLine = (line: string): string => {
  const parts: string[] = [];
  let part = "";
  let size = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const length = octets(char);
    if (size + length > limit) {
      parts.push(part);
      part = "";
      size = 0;
      // The space at the start of a continuation line is one of its 75 octets
      limit = MAX_LINE_OCTETS - 1;
    }
    part += char;
    size += length;
  }
  parts.push(part);
  return parts.join("\r\n ");
};

/** This function gives a time in the UTC form of RFC 5545: `20261016T143000Z`. */
export const formatUtc = (iso: string): string => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`"${iso}" is not an ISO 8601 time`);
  const text = new Date(ms).toISOString();
  if (!/^\d{4}-/.test(text)) throw new RangeError(`"${iso}" is not in the years 0000 to 9999`);
  // RFC 5545 has no fractions of a second
  return text.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

/** This function gives the date part of a text (`YYYY-MM-DD...`) in the form of RFC 5545: `20261016`. */
export const formatDate = (value: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = m === null ? undefined : new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (m === null || date === undefined || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== m[0]) {
    throw new RangeError(`"${value}" does not start with a date (YYYY-MM-DD)`);
  }
  return `${m[1]}${m[2]}${m[3]}`;
};

const token = (name: string, value: string): string => {
  if (!TOKEN.test(value)) throw new RangeError(`${name} "${value}" is not a token (letters, digits and "-")`);
  return value.toUpperCase();
};

/** The lines of one VEVENT, before the fold. */
const eventLines = (event: IcsWriteEvent, stamp: string): string[] => {
  if (event.uid.length === 0) throw new RangeError("An event has no UID");
  const allDay = event.allDay === true;
  const time = (value: string): string => (allDay ? `;VALUE=DATE:${formatDate(value)}` : `:${formatUtc(value)}`);
  const text = (name: string, value: string | undefined): string[] =>
    value === undefined || value.length === 0 ? [] : [`${name}:${escapeText(value)}`];
  const lines = ["BEGIN:VEVENT", `UID:${escapeText(event.uid)}`, `DTSTAMP:${stamp}`, `DTSTART${time(event.start)}`];
  if (event.end !== undefined) lines.push(`DTEND${time(event.end)}`);
  lines.push(...text("SUMMARY", event.summary));
  if (event.rrule !== undefined) {
    if (!RRULE.test(event.rrule)) throw new RangeError(`The RRULE of ${event.uid} has a character that a recurrence rule does not use`);
    lines.push(`RRULE:${event.rrule}`);
  }
  if (event.exdates !== undefined && event.exdates.length > 0) {
    // EXDATE has the value type of DTSTART: a date, or the start time of the skipped occurrence
    const startTime = allDay ? "" : formatUtc(event.start).slice(8);
    const values = event.exdates.map((date) => `${formatDate(date)}${startTime}`);
    lines.push(allDay ? `EXDATE;VALUE=DATE:${values.join(",")}` : `EXDATE:${values.join(",")}`);
  }
  lines.push(...text("LOCATION", event.location), ...text("DESCRIPTION", event.description));
  if (event.url !== undefined) {
    if (event.url.length === 0 || UNSAFE_URI.test(event.url)) throw new RangeError(`The URL of ${event.uid} has a space or a control character`);
    lines.push(`URL:${event.url}`);
  }
  if (event.status !== undefined) {
    if (!STATUSES.has(event.status)) throw new RangeError(`The STATUS of ${event.uid} is not TENTATIVE, CONFIRMED or CANCELLED`);
    lines.push(`STATUS:${event.status}`);
  }
  if (event.sequence !== undefined) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new RangeError(`The SEQUENCE of ${event.uid} is not an integer of 0 or more`);
    }
    lines.push(`SEQUENCE:${event.sequence}`);
  }
  lines.push("END:VEVENT");
  return lines;
};

/**
 * This function writes a calendar (RFC 5545) from events. Each line ends with CRLF, and each
 * long line is folded. It throws a `RangeError` for a value that the format cannot hold.
 */
export const writeIcs = (events: readonly IcsWriteEvent[], options: IcsCalendarOptions = {}): string => {
  const stamp = formatUtc(options.stamp ?? new Date().toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${escapeText(options.prodId ?? DEFAULT_PRODID)}`];
  if (options.calscale !== undefined) lines.push(`CALSCALE:${token("CALSCALE", options.calscale)}`);
  if (options.method !== undefined) lines.push(`METHOD:${token("METHOD", options.method)}`);
  if (options.calendarName !== undefined) lines.push(`X-WR-CALNAME:${escapeText(options.calendarName)}`);
  for (const event of events) lines.push(...eventLines(event, stamp));
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};
