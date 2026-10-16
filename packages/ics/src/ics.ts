/**
 * An iCalendar (RFC 5545) reader: the events of a calendar, and the occurrences of an event in a
 * time window. It has no dependencies. It reads the properties that a calendar of events needs, and
 * it ignores the others (alarms, attendees, time zone definitions).
 */

/** One event of a calendar (one VEVENT). */
export interface IcsEvent {
  readonly uid: string;
  readonly summary: string;
  /** The start, in UTC (`YYYY-MM-DDTHH:MM:SSZ`). An all-day event starts at noon UTC of its date. */
  readonly start: string;
  /** The end, in UTC. Without DTEND, one hour after the start (one day for an all-day event). */
  readonly end: string;
  readonly allDay: boolean;
  /** The recurrence rule (`RRULE`), as the calendar gives it. */
  readonly rrule?: string | undefined;
  readonly location?: string | undefined;
  /** The dates (`YYYY-MM-DD`) that EXDATE removes from the recurrence. */
  readonly exdates?: readonly string[] | undefined;
  /** The TZID of DTSTART. A recurrence keeps the local time of this zone across a DST change. */
  readonly tzid?: string | undefined;
  /**
   * The RECURRENCE-ID date (`YYYY-MM-DD`). This event replaces that one occurrence of the series
   * with the same UID. Use `uid` and `recurrenceId` together as the key of an event.
   */
  readonly recurrenceId?: string | undefined;
  /**
   * SEQUENCE and LAST-MODIFIED change only when a person edits the event. Use them to find the
   * newest version of an event. Do not use DTSTAMP: it changes at each export.
   */
  readonly sequence?: number | undefined;
  readonly lastModified?: string | undefined;
}

/** One occurrence of an event in a time window. */
export interface Occurrence {
  readonly uid: string;
  readonly summary: string;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly location?: string | undefined;
}

interface IcsProp {
  readonly name: string;
  readonly params: ReadonlyMap<string, string>;
  readonly value: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** A recurrence makes at most this number of occurrences. It is a bound for safety. */
const MAX_ITERATIONS = 20_000;

const toIso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** The lines of a calendar, with the folded lines (RFC 5545 3.1) joined. */
const unfold = (text: string): string[] =>
  text
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

/**
 * This function decodes an RFC 5545 TEXT value. Exporters write both `\n` and `\N` for a new
 * line. It reads each escape one time from left to right, so `\\n` is a backslash and an `n`.
 */
export const unescapeText = (value: string): string =>
  value.replace(/\\([\\;,nN])/g, (_escape: string, char: string) => (char === "n" || char === "N" ? "\n" : char));

const parseProp = (line: string): IcsProp | undefined => {
  const colon = line.indexOf(":");
  if (colon === -1) return undefined;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name = "", ...paramParts] = head.split(";");
  const params = new Map<string, string>();
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq !== -1) params.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1));
  }
  return { name: name.toUpperCase(), params, value };
};

const tzOffsetMs = (timeZone: string, date: Date): number => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = new Map(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.get("hour") === "24" ? "00" : (parts.get("hour") ?? "00");
  const local = Date.UTC(
    Number(parts.get("year")),
    Number(parts.get("month")) - 1,
    Number(parts.get("day")),
    Number(hour),
    Number(parts.get("minute")),
    Number(parts.get("second"))
  );
  return local - date.getTime();
};

/** This function gives the UTC time (ISO 8601) of a local time in an IANA time zone. */
export const zonedToUtc = (y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): string => {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let ts = asUtc - tzOffsetMs(timeZone, new Date(asUtc));
  // A second pass corrects the offset near a DST change
  const second = asUtc - tzOffsetMs(timeZone, new Date(ts));
  if (second !== ts) ts = second;
  return toIso(ts);
};

const parseIcsDate = (prop: IcsProp): { iso: string; allDay: boolean; tzid?: string } | undefined => {
  const value = prop.value;
  const tzid = prop.params.get("TZID");
  const dateOnly = prop.params.get("VALUE") === "DATE" || /^\d{8}$/.test(value);
  if (dateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (m === null) return undefined;
    // Noon UTC, not midnight: an all-day date has no zone, and midnight UTC is the day before in
    // each zone west of UTC. Noon UTC is the correct date in each zone from -11 h to +11 h.
    return { iso: `${m[1]}-${m[2]}-${m[3]}T12:00:00Z`, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (m === null) return undefined;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === "Z" || tzid === undefined) {
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, allDay: false };
  }
  const nums = [y, mo, d, h, mi, s].map(Number) as [number, number, number, number, number, number];
  return { iso: zonedToUtc(...nums, tzid), allDay: false, tzid };
};

/** The local date, time and weekday of a UTC time in a zone. */
const localParts = (
  iso: string,
  tz: string
): { y: number; mo: number; d: number; h: number; mi: number; s: number; weekday: number } => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const p = new Map(dtf.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const hour = p.get("hour") === "24" ? "00" : (p.get("hour") ?? "00");
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(p.get("year")),
    mo: Number(p.get("month")),
    d: Number(p.get("day")),
    h: Number(hour),
    mi: Number(p.get("minute")),
    s: Number(p.get("second")),
    weekday: weekdays[p.get("weekday") ?? "Sun"] ?? 0,
  };
};

const dateOf = (value: string): string | undefined => {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  return m === null ? undefined : `${m[1]}-${m[2]}-${m[3]}`;
};

/** True when a text is an iCalendar object. A proxy error page is not. */
export const isCalendar = (text: string): boolean => /^\s*BEGIN:VCALENDAR/i.test(text);

/**
 * This function gives the events of a calendar. It skips an event without a UID or a start, and
 * an event with STATUS:CANCELLED.
 */
export const parseIcs = (text: string): IcsEvent[] => {
  const events: IcsEvent[] = [];
  let current: Map<string, IcsProp> | undefined;
  // EXDATE can occur more than one time, each with a list of dates: keep them apart from the map
  let exdates: string[] = [];
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = new Map();
      exdates = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (current !== undefined) {
        const event = eventOf(current, exdates);
        if (event !== undefined) events.push(event);
      }
      current = undefined;
      continue;
    }
    if (current === undefined) continue;
    const prop = parseProp(line);
    if (prop === undefined) continue;
    if (prop.name === "EXDATE") {
      for (const value of prop.value.split(",")) {
        const date = dateOf(value);
        if (date !== undefined) exdates.push(date);
      }
    } else {
      current.set(prop.name, prop);
    }
  }
  return events;
};

const eventOf = (props: ReadonlyMap<string, IcsProp>, exdates: readonly string[]): IcsEvent | undefined => {
  // UID is a TEXT value (RFC 5545 3.8.4.7), so it can have escapes
  const uidValue = props.get("UID")?.value;
  const uid = uidValue === undefined ? undefined : unescapeText(uidValue);
  const startProp = props.get("DTSTART");
  const start = startProp === undefined ? undefined : parseIcsDate(startProp);
  if (uid === undefined || start === undefined || props.get("STATUS")?.value === "CANCELLED") return undefined;
  const endProp = props.get("DTEND");
  const end = endProp === undefined ? undefined : parseIcsDate(endProp);
  const location = props.get("LOCATION")?.value;
  const recurrenceValue = props.get("RECURRENCE-ID")?.value;
  const recurrenceId = recurrenceValue === undefined ? undefined : dateOf(recurrenceValue);
  const sequenceValue = props.get("SEQUENCE")?.value;
  const sequence = sequenceValue === undefined ? undefined : Number.parseInt(sequenceValue, 10);
  const lastModified = props.get("LAST-MODIFIED")?.value;
  const rrule = props.get("RRULE")?.value;
  return {
    uid,
    summary: unescapeText(props.get("SUMMARY")?.value ?? "(untitled)"),
    start: start.iso,
    end: end?.iso ?? toIso(Date.parse(start.iso) + (start.allDay ? DAY_MS : HOUR_MS)),
    allDay: start.allDay,
    ...(rrule !== undefined ? { rrule } : {}),
    ...(location !== undefined ? { location: unescapeText(location) } : {}),
    ...(exdates.length > 0 ? { exdates: [...exdates] } : {}),
    ...(start.tzid !== undefined ? { tzid: start.tzid } : {}),
    ...(recurrenceId !== undefined ? { recurrenceId } : {}),
    ...(sequence !== undefined && Number.isFinite(sequence) ? { sequence } : {}),
    ...(lastModified !== undefined ? { lastModified } : {}),
  };
};

const BYDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** A time window: the occurrences that touch it are in the result. */
export interface TimeWindow {
  readonly from: string;
  readonly to: string;
}

/**
 * This function gives the occurrences of an event that touch a time window. It knows FREQ DAILY,
 * WEEKLY (with BYDAY), MONTHLY and YEARLY, with INTERVAL, COUNT, UNTIL and EXDATE. An event with
 * a TZID keeps its local time across a DST change. Other rules give the first occurrence only.
 */
export const expandOccurrences = (event: IcsEvent, window: TimeWindow): Occurrence[] => {
  const windowFrom = Date.parse(window.from);
  const windowTo = Date.parse(window.to);
  const startMs = Date.parse(event.start);
  const duration = Date.parse(event.end) - startMs;
  const occurrence = (ms: number): Occurrence => ({
    uid: event.uid,
    summary: event.summary,
    start: toIso(ms),
    end: toIso(ms + duration),
    allDay: event.allDay,
    ...(event.location !== undefined ? { location: event.location } : {}),
  });
  const once = (): Occurrence[] => (startMs + duration >= windowFrom && startMs <= windowTo ? [occurrence(startMs)] : []);

  if (event.rrule === undefined) return once();

  const rule = new Map<string, string>();
  for (const part of event.rrule.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1) rule.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1));
  }
  const freq = rule.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return once();
  const interval = Math.max(1, Number(rule.get("INTERVAL") ?? "1") || 1);
  const count = rule.has("COUNT") ? Number(rule.get("COUNT")) : undefined;
  const untilRaw = rule.get("UNTIL");
  const until =
    untilRaw === undefined
      ? undefined
      : Date.parse(
          /^\d{8}$/.test(untilRaw)
            ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}T23:59:59Z`
            : `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}T${untilRaw.slice(9, 11)}:${untilRaw.slice(11, 13)}:${untilRaw.slice(13, 15)}Z`
        );

  // For an event with a TZID, each occurrence keeps the local time of the zone, so a 6 PM event
  // stays at 6 PM after a DST change. The weekday is also the local weekday.
  const tz = event.tzid;
  const local = tz !== undefined ? localParts(event.start, tz) : undefined;
  const startWeekday = local !== undefined ? local.weekday : new Date(startMs).getUTCDay();
  const msAfterDays = (days: number): number => {
    if (tz === undefined || local === undefined) return startMs + days * DAY_MS;
    const civil = new Date(Date.UTC(local.y, local.mo - 1, local.d + days));
    return Date.parse(
      zonedToUtc(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), local.h, local.mi, local.s, tz)
    );
  };
  const base =
    local ??
    (() => {
      const utc = new Date(startMs);
      return {
        y: utc.getUTCFullYear(),
        mo: utc.getUTCMonth() + 1,
        d: utc.getUTCDate(),
        h: utc.getUTCHours(),
        mi: utc.getUTCMinutes(),
        s: utc.getUTCSeconds(),
      };
    })();
  // MONTHLY and YEARLY move by calendar months, so the 14th stays the 14th. RFC 5545: a month
  // without the day (a 31st in April) has no occurrence. The date does not move to the next month.
  const msAfterMonths = (months: number): number | undefined => {
    const total = base.mo - 1 + months;
    const y = base.y + Math.floor(total / 12);
    const mo = (((total % 12) + 12) % 12) + 1;
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (base.d > daysInMonth) return undefined;
    return tz !== undefined
      ? Date.parse(zonedToUtc(y, mo, base.d, base.h, base.mi, base.s, tz))
      : Date.UTC(y, mo - 1, base.d, base.h, base.mi, base.s);
  };

  // The loops go through the whole series from its start, and keep only the occurrences in the
  // window. A series that started years ago still reaches the window.
  const starts: number[] = [];
  if (freq === "MONTHLY" || freq === "YEARLY") {
    const step = interval * (freq === "YEARLY" ? 12 : 1);
    let emitted = 0;
    for (let n = 0; n < MAX_ITERATIONS; n += 1) {
      const ms = msAfterMonths(n * step);
      // A month without the day uses an iteration, but it is not counted by COUNT
      if (ms === undefined) continue;
      if ((until !== undefined && ms > until) || (count !== undefined && emitted >= count) || ms > windowTo) break;
      emitted += 1;
      if (ms + duration >= windowFrom) starts.push(ms);
    }
  } else if (freq === "DAILY") {
    for (let n = 0; n < MAX_ITERATIONS; n += 1) {
      const ms = msAfterDays(n * interval);
      if ((until !== undefined && ms > until) || (count !== undefined && n >= count) || ms > windowTo) break;
      if (ms + duration >= windowFrom) starts.push(ms);
    }
  } else {
    const byday = (rule.get("BYDAY")?.split(",") ?? []).map((day) => BYDAY_INDEX[day]);
    const days = byday.filter((day): day is number => day !== undefined);
    const anchors = (days.length > 0 ? days : [startWeekday]).sort((a, b) => a - b);
    let emitted = 0;
    let done = false;
    for (let week = 0; week < MAX_ITERATIONS && !done; week += 1) {
      for (const day of anchors) {
        const ms = msAfterDays(week * interval * 7 + day - startWeekday);
        if (ms < startMs) continue;
        if ((until !== undefined && ms > until) || (count !== undefined && emitted >= count) || ms > windowTo) {
          done = true;
          break;
        }
        emitted += 1;
        if (ms + duration >= windowFrom) starts.push(ms);
      }
    }
  }

  // EXDATE removes an occurrence by its date
  const excluded = new Set(event.exdates ?? []);
  return starts.filter((ms) => !excluded.has(toIso(ms).slice(0, 10))).map(occurrence);
};

/**
 * This function gives the occurrences of all events of a calendar in a time window, sorted by
 * start. An event with a RECURRENCE-ID replaces the occurrence of its series on that date.
 */
export const calendarOccurrences = (events: readonly IcsEvent[], window: TimeWindow): Occurrence[] => {
  const replaced = new Set(
    events.filter((event) => event.recurrenceId !== undefined).map((event) => `${event.uid}|${event.recurrenceId}`)
  );
  const out: Occurrence[] = [];
  for (const event of events) {
    for (const occurrence of expandOccurrences(event, window)) {
      const replacedHere =
        event.recurrenceId === undefined && replaced.has(`${event.uid}|${occurrence.start.slice(0, 10)}`);
      if (!replacedHere) out.push(occurrence);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
};
