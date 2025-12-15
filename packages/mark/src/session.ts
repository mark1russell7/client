/**
 * Session ID generation for CLI operations
 *
 * Session IDs are used to group logs and track CLI invocations.
 * Format: YYYYMMDD-HHMMSS-XXXX (e.g., 20241215-143052-a7b3)
 */

/**
 * Generate a random hex string
 */
function randomHex(length: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Pad a number with leading zeros
 */
function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}

/**
 * Generate a session ID
 *
 * @example
 * generateSessionId() // "20241215-143052-a7b3"
 */
export function generateSessionId(): string {
  const now = new Date();

  const date = [
    now.getFullYear(),
    pad(now.getMonth() + 1, 2),
    pad(now.getDate(), 2),
  ].join("");

  const time = [
    pad(now.getHours(), 2),
    pad(now.getMinutes(), 2),
    pad(now.getSeconds(), 2),
  ].join("");

  const random = randomHex(4);

  return `${date}-${time}-${random}`;
}

/**
 * Parse a session ID into its components
 */
export function parseSessionId(sessionId: string): {
  date: string;
  time: string;
  random: string;
} | null {
  const match = sessionId.match(/^(\d{8})-(\d{6})-([0-9a-f]{4})$/);
  if (!match) return null;

  return {
    date: match[1]!,
    time: match[2]!,
    random: match[3]!,
  };
}
