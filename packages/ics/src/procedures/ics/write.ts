/**
 * ics.write procedure
 *
 * Write an iCalendar text from events
 */

import type { IcsWriteInput, IcsWriteOutput } from "../../types.js";
import { writeIcs } from "../../write.js";

/**
 * This function writes the iCalendar text of the events. It changes nothing.
 */
export async function icsWrite(input: IcsWriteInput): Promise<IcsWriteOutput> {
  const { events, ...options } = input;
  return { text: writeIcs(events, options) };
}
