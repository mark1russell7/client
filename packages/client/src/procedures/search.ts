/**
 * The search of a catalog of procedures or tools (direction 40, the tool surface). A server with
 * thousands of procedures cannot give each tool to the context of a session. The session searches
 * the catalog, reads the description of a hit, and calls it. This file holds the one ranking:
 * `procedure.search` and the search listing of the MCP server use it.
 *
 * The ranking is BM25 over three fields: the words of the name (weight 3), the tags (weight 2)
 * and the description (weight 1). A word of the query also matches the start of a longer word of
 * a document, at half weight, so `boot` finds `bootstrap`. A synonym of a word of the query from
 * the thesaurus also matches at half weight, so `remove` finds `delete`.
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

// A synonym of a word of the query matches at this weight, so the word itself counts more
const SYNONYM_WEIGHT = 0.5;

/**
 * The thesaurus of the search: groups of the general words of tool operations and their objects.
 * Each word of a group is a synonym of each other word of the group. An entry with a space is a
 * phrase: two adjacent words of the query that match the single words of their group. A word can
 * be in more than one group. The groups name operations, not single tools, so a new tool needs no
 * new entry.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // The operations on things
  ["create", "make", "new", "generate", "scaffold"],
  ["add", "insert", "append"],
  ["delete", "remove", "erase", "drop", "rm", "unlink", "destroy"],
  ["update", "modify", "change", "edit", "alter"],
  ["get", "read", "retrieve", "fetch", "load"],
  ["pull", "download", "fetch"],
  ["push", "upload"],
  ["write", "save", "store", "persist"],
  ["list", "enumerate", "ls"],
  ["find", "search", "locate", "lookup", "query"],
  ["copy", "duplicate", "clone"],
  ["move", "rename", "mv"],
  ["diff", "difference", "compare", "delta"],
  ["merge", "combine", "join", "union"],
  ["split", "divide", "partition"],
  ["sort", "order"],
  ["reduce", "fold", "accumulate"],
  ["validate", "check", "verify", "lint"],
  ["parse", "decode", "deserialize"],
  ["stringify", "serialize", "encode"],
  ["format", "prettify"],
  // The operations on runs
  ["run", "execute", "exec", "invoke", "launch"],
  ["stop", "kill", "terminate", "halt", "abort"],
  ["restart", "reboot", "reload"],
  ["wait", "sleep", "delay", "pause"],
  ["parallel", "concurrent", "concurrently", "simultaneous", "simultaneously", "same time"],
  ["chain", "sequence", "sequential", "serial", "series"],
  // The objects
  ["directory", "folder", "dir"],
  ["repository", "repo"],
  ["package", "library", "lib"],
  ["configuration", "config", "setting"],
  ["environment", "env"],
  ["record", "document", "row"],
  ["statistic", "stat", "metric"],
  ["error", "failure", "fault", "exception"],
];

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

/** The synonyms of each word and of each phrase of the thesaurus, in the form of `searchWords`. */
interface Thesaurus {
  readonly words: ReadonlyMap<string, ReadonlySet<string>>;
  readonly phrases: ReadonlyMap<string, ReadonlySet<string>>;
}

function thesaurusOf(groups: readonly (readonly string[])[]): Thesaurus {
  const words = new Map<string, Set<string>>();
  const phrases = new Map<string, Set<string>>();
  for (const group of groups) {
    const singles: string[] = [];
    const multiples: string[] = [];
    for (const entry of group) {
      const parts = searchWords(entry);
      if (parts.length === 1) singles.push(parts[0]!);
      else if (parts.length > 1) multiples.push(parts.join(" "));
    }
    for (const word of singles) {
      const synonyms = words.get(word) ?? new Set<string>();
      for (const other of singles) if (other !== word) synonyms.add(other);
      words.set(word, synonyms);
    }
    for (const phrase of multiples) {
      const synonyms = phrases.get(phrase) ?? new Set<string>();
      for (const word of singles) synonyms.add(word);
      phrases.set(phrase, synonyms);
    }
  }
  return { words, phrases };
}

const THESAURUS = thesaurusOf(SYNONYM_GROUPS);

/** One term of a query: the words that match it, each with its weight. */
type Term = ReadonlyMap<string, number>;

/**
 * This function gives the terms of a query. Each word of the query is a term with the word at
 * weight 1 and its synonyms at `SYNONYM_WEIGHT`. Two adjacent words that are a phrase of the
 * thesaurus also give a term of the synonyms of the phrase.
 */
function termsOf(words: readonly string[]): Term[] {
  const terms: Term[] = [];
  const termOf = (exact: string | undefined, synonyms: Iterable<string>): Term => {
    const term = new Map<string, number>();
    for (const synonym of synonyms) term.set(synonym, SYNONYM_WEIGHT);
    if (exact !== undefined) term.set(exact, 1);
    return term;
  };
  for (const word of new Set(words)) terms.push(termOf(word, THESAURUS.words.get(word) ?? []));
  for (let i = 0; i + 1 < words.length; i++) {
    const synonyms = THESAURUS.phrases.get(`${words[i]} ${words[i + 1]}`);
    if (synonyms !== undefined) terms.push(termOf(undefined, synonyms));
  }
  return terms;
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
  const words = searchWords(query);
  const total = documents.length;
  if (words.length === 0 || total === 0) return { hits: [], matched: 0, total };

  const index = documents.map(indexOf);
  const averageLength = index.reduce((sum, indexed) => sum + indexed.length, 0) / total || 1;
  const scores = new Array<number>(total).fill(0);
  // Each word of a term has its own IDF, so a common synonym does not lower the weight of a rare
  // word. A document scores the best word of each term, so two synonyms do not count two times.
  for (const term of termsOf(words)) {
    const best = new Array<number>(total).fill(0);
    for (const [word, weight] of term) {
      const frequencies = index.map((indexed) => matchFrequency(indexed, word));
      const containing = frequencies.filter((frequency) => frequency > 0).length;
      if (containing === 0) continue;
      const idf = Math.log(1 + (total - containing + 0.5) / (containing + 0.5));
      frequencies.forEach((frequency, i) => {
        if (frequency === 0) return;
        const norm = K1 * (1 - B + (B * index[i]!.length) / averageLength);
        best[i] = Math.max(best[i]!, (weight * idf * frequency * (K1 + 1)) / (frequency + norm));
      });
    }
    best.forEach((score, i) => {
      scores[i]! += score;
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
