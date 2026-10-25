---
"@procedures/pdf": patch
---

`pdf.render` prints into its temporary folder, and the file replaces `output` only after its check. A failed render keeps an old output file. Before, the render deleted it first (second code audit, roadmap O57).
