---
"@procedures/mark": patch
---

The package leaves out `dist/manifest.json`. Each build gave this file a different fingerprint and time, so the release check found a change in each pull request. An installed copy did not read the shipped file, because its fingerprint names the builds of the workspace. The first start of an installed copy writes the file, as before. No effect on the public API.
