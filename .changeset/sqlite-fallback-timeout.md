---
---

Three tests of a store in a file get a limit of 30 s. On a Windows runner each one went past the default 5 s. They are the contract cases of the sql.js store, the restarts of the sqlite local copy and the parallel updates of the schedule store. No effect on the public API.
