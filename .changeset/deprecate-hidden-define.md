---
"@procedures/client": patch
"@procedures/store": patch
---

Deprecated: under the expose rule of a host, `procedure.define` at a free hidden path, and `procedure.load` of a stored program at a free hidden path. From 0.62.0, the define gets `NOT_EXPOSED`, and the load gives the program as a conflict.

To prepare, move each such program to an exposed path, or add its path to the expose rule of the host. This note changes no code.
