---
"@procedures/privacy-scan": minor
---

New package: `privacyScan.text` and `privacyScan.files` find private data in text before it goes public. They find email addresses, phone numbers, coordinate pairs and the terms of a list. `privacyScan.text` is pure. `privacyScan.files` declares `reads: ["fs"]` and `writes: []`.
