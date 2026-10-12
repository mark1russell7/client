/**
 * The fuzzy search of the command palette. A query matches a text when its characters are in the
 * text in order. The score prefers matches at the start of the text and of its words, and runs
 * of characters that follow each other.
 */

/** The score of a query in a text, or null when the text does not match. A higher score is better. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (q === "") return 0;
  const t = text.toLowerCase();
  // A contained text is the best match: the earlier, the better
  const at = t.indexOf(q);
  if (at >= 0) {
    const wordStart = at === 0 || /[\s./_-]/.test(t[at - 1]!);
    return 1000 - at + (wordStart ? 200 : 0) + (at === 0 ? 100 : 0) - t.length * 0.1;
  }
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of q) {
    if (char === " ") continue;
    const index = t.indexOf(char, from);
    if (index < 0) return null;
    // A character that follows the previous one, or that starts a word, counts more
    if (index === previous + 1) score += 8;
    else if (index === 0 || /[\s./_-]/.test(t[index - 1]!)) score += 6;
    else score += 1;
    score -= Math.min(index - from, 10) * 0.2;
    previous = index;
    from = index + 1;
  }
  return score - t.length * 0.05;
}

export interface Searchable {
  /** The text that the search reads. */
  text: string;
}

/** The items that match a query, the best first. An empty query keeps the order. */
export function search<T extends Searchable>(items: readonly T[], query: string, limit = 50): T[] {
  if (query.trim() === "") return items.slice(0, limit);
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = fuzzyScore(query, item.text);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.item);
}
