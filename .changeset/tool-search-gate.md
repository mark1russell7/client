---
"@procedures/mcp-server": patch
---

The quality gate of the tool search (direction 40). The new function `toolSearchDocuments` gives the search documents of the tools, as `search_tools` ranks them. The dev-tools server has a golden set of 48 task queries, and a test holds its measures: 39 queries find the expected tool first, 43 in the first 5, and the mean reciprocal rank is 0.849.
