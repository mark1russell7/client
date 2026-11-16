/**
 * The search of a catalog of procedures or tools (direction 40, the tool surface). A server with
 * thousands of procedures cannot give each tool to the context of a session. The session searches
 * the catalog, reads the description of a hit, and calls it. This file holds the one ranking:
 * `procedure.search` and the search listing of the MCP server use it.
 *
 * The ranking is BM25 over three fields: the words of the name (weight 3), the tags (weight 2)
 * and the description (weight 1). A word of the query also matches the start of a longer word of
 * a document, at half weight, so `boot` finds `bootstrap`.
 */

/** One document of a search: the text of one procedure or one tool. */
export interface SearchDocument {
  /** The name that a hit gives: the key of a procedure, or the name of a tool. */
  readonly name: string;
  /** The text of the name field, for example the segments of a path. The default is the name. */
  readonly words?: readonly string[] | undefined;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
}

/** One hit of a search. */
export interface SearchHit {
  readonly name: string;
  /** The first line of the description, at most 200 characters. */
  readonly description: string | undefined;
  /** The score of the match, rounded to 3 decimals. A better match has a higher score. */
  readonly score: number;
}

/** The options of a search. */
export interface SearchOptions {
  /** The most hits to give, from 1 to 100. The default is 10. */
  readonly limit?: number | undefined;
}

/** The result of a search. */
export interface SearchResult {
  /** The best hits, the best first. Two hits with one score are in the order of their names. */
  readonly hits: SearchHit[];
  /** The number of documents that match one word of the query or more. */
  readonly matched: number;
  /** The number of documents of the search. */
  readonly total: number;
}

/** The default number of hits of a search. */
export const SEARCH_LIMIT = 10;

/** The most hits of one search. */
export const SEARCH_MAX_LIMIT = 100;

/** The longest description of a hit, in characters. */
const HIT_DESCRIPTION_LENGTH = 200;

// The words that do not tell one procedure from another
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "each", "for", "from", "in", "into", "is", "it",
  "its", "of", "on", "or", "that", "the", "this", "to", "with",
]);

// The weight of each field in the term frequency of a document
const NAME_WEIGHT = 3;
const TAG_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;

// A word of the query that is the start of a longer word: its weight, and its shortest length
const PREFIX_WEIGHT = 0.5;
const PREFIX_LENGTH = 3;

// The parameters of BM25
const K1 = 1.2;
const B = 0.75;

// A part of a text: a run of capitals before a capital and a lower-case letter, a word with one
// capital or none, or a run of digits. `HTTPServer` gives `HTTP` and `Server`.
const WORD_PART = /\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+/gu;

/**
 * This function gives the search words of a text, in lower case. It splits the text at each
 * character that is not a letter or a digit, and at each change of case in a word, so
 * `bootstrapMedian` gives `bootstrap` and `median`. It removes the stop words and the plural `s`.
 *
 * The split of a word at a change of case is a part of case conversion. It moves to
 * `@mark1russell7/text` when that package has its case functions.
 */
export function searchWords(text: string): string[] {
  const words: string[] = [];
  for (const part of text.split(/[^\p{L}\p{N}]+/u)) {
    for (const match of part.matchAll(WORD_PART)) {
      const word = match[0].toLowerCase();
      if (STOP_WORDS.has(word)) continue;
      words.push(word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
    }
  }
  return words;
}

/** The first line of a description, at most `HIT_DESCRIPTION_LENGTH` characters. */
function hitDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  const line = description.trim().split("\n", 1)[0]!.trim();
  return line.length <= HIT_DESCRIPTION_LENGTH ? line : `${line.slice(0, HIT_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

interface Indexed {
  readonly document: SearchDocument;
  /** The weighted frequency of each word of the document. */
  readonly frequency: Map<string, number>;
  readonly length: number;
}

function indexOf(document: SearchDocument): Indexed {
  const frequency = new Map<string, number>();
  let length = 0;
  const add = (texts: readonly string[], weight: number): void => {
    for (const text of texts) {
      for (const word of searchWords(text)) {
        frequency.set(word, (frequency.get(word) ?? 0) + weight);
        length += weight;
      }
    }
  };
  add(document.words ?? [document.name], NAME_WEIGHT);
  add(document.tags ?? [], TAG_WEIGHT);
  add(document.description === undefined ? [] : [document.description], DESCRIPTION_WEIGHT);
  return { document, frequency, length };
}

/** The weighted frequency of the words of a document that match one word of the query. */
function matchFrequency(indexed: Indexed, query: string): number {
  let total = 0;
  for (const [word, frequency] of indexed.frequency) {
    if (word === query) total += frequency;
    else if (query.length >= PREFIX_LENGTH && word.startsWith(query)) total += frequency * PREFIX_WEIGHT;
  }
  return total;
}

/**
 * This function gives the documents that match a query, the best match first. A query with no
 * search words (for example only stop words) matches nothing. The ranking is BM25: a rare word
 * counts more than a common word, and a short document with the word counts more than a long one.
 */
export function searchDocuments(documents: readonly SearchDocument[], query: string, options: SearchOptions = {}): SearchResult {
  const asked = options.limit !== undefined && Number.isFinite(options.limit) ? Math.trunc(options.limit) : SEARCH_LIMIT;
  const limit = Math.min(SEARCH_MAX_LIMIT, Math.max(1, asked));
  const words = [...new Set(searchWords(query))];
  const total = documents.length;
  if (words.length === 0 || total === 0) return { hits: [], matched: 0, total };

  const index = documents.map(indexOf);
  const averageLength = index.reduce((sum, indexed) => sum + indexed.length, 0) / total || 1;
  const scores = new Array<number>(total).fill(0);
  for (const word of words) {
    const frequencies = index.map((indexed) => matchFrequency(indexed, word));
    const containing = frequencies.filter((frequency) => frequency > 0).length;
    if (containing === 0) continue;
    const idf = Math.log(1 + (total - containing + 0.5) / (containing + 0.5));
    frequencies.forEach((frequency, i) => {
      if (frequency === 0) return;
      const norm = K1 * (1 - B + (B * index[i]!.length) / averageLength);
      scores[i]! += (idf * frequency * (K1 + 1)) / (frequency + norm);
    });
  }

  const matches = index
    .map((indexed, i) => ({ document: indexed.document, score: scores[i]! }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || (a.document.name < b.document.name ? -1 : a.document.name > b.document.name ? 1 : 0));
  const hits = matches.slice(0, limit).map(({ document, score }) => ({
    name: document.name,
    description: hitDescription(document.description),
    score: Math.round(score * 1000) / 1000,
  }));
  return { hits, matched: matches.length, total };
}
