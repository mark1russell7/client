---
"@procedures/mark": patch
---

The lockfile endpoint of `mark` in server mode puts an IPv6 host in brackets, for example `http://[::1]:3000/api`. The host `::` gives `localhost`. (second code audit, roadmap O57).
