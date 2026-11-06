---
"@procedures/client": minor
---

The live state has two limits of bytes: `maxTopicBytes` for each topic, and `maxBytes` for all topics.

The product of the earlier limits is more than 64 GiB, so they did not bound the memory of a host. The defaults are 1 MiB for a topic and 64 MiB for a state. A set that adds bytes above a limit gets `FORBIDDEN` with the reason `write-not-allowed`. A set that makes a value smaller goes. The getter `bytes` gives the bytes of the values, as JSON.

A value from another host has the same limits. A value that does not fit is not kept, and the old value of its key ends with the reason `expired`.

Migration: find the hosts that keep more than 1 MiB of values on one topic, or more than 64 MiB in all. Each of them sets `maxTopicBytes` or `maxBytes` in the option `live` of `EventPublisher`.
