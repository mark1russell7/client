/**
 * exists procedure
 *
 * Check if file or directory exists
 */

import { type ExistsInput, type ExistsOutput } from "../../types.js";
import { stat } from "./stat.js";

/**
 * Check if file or directory exists
 */
export async function exists(input: ExistsInput): Promise<ExistsOutput> {
  try {
    const stats = await stat(input);
    return { exists: true, stats };
  } catch {
    return { exists: false };
  }
}
