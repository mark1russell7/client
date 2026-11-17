---
"@procedures/client": patch
"@procedures/mcp-dev-tools": patch
---

The tool search finds synonyms. A thesaurus of the general words of tool operations gives each word of the query its synonyms at half weight. So `remove` finds `delete`, `download` finds `pull`, and the phrase `same time` finds `parallel`.

- Each synonym has its own IDF, so a common synonym does not lower the weight of a rare word of the query.
- A document scores the best word of each term, so two synonyms in one document do not count two times.
- The golden set of the dev tools has 20 new held-out queries, written before the first run of the synonyms. On the 48 old queries, hit5 goes from 43 to 48 and hit1 from 39 to 43. On the 20 held-out queries, hit5 goes from 16 to 19 and hit1 from 7 to 15.

PATCH: before 1.0.0, a backward-compatible feature raises PATCH. The API does not change: `searchDocuments` keeps its signature and only ranks better.
