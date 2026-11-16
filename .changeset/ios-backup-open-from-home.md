---
"@procedures/ios-backup": patch
---

The package opens each SQLite file with `openDatabase` of `@mark1russell7/sqlite`, with `readOnly`. The read does not change: the connection reads the file and does not write it.

- On Node.js 26.11 and later, a read gives no warning DEP0210. Node.js 26.11 renamed the class `DatabaseSync` to `Database`, and `openDatabase` takes the new name first.
- The package has the new dependency `@mark1russell7/sqlite`. It loads that package at the first read, as it loaded `node:sqlite` before.
