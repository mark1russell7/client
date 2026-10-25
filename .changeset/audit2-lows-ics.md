---
"@procedures/ics": patch
---

`writeIcs` writes the EXDATE of an event with a `tzid` in that zone, with the TZID and the local start time. The parser reads the EXDATE dates in the zone of the event, so a parse, a write and a parse skip the same occurrence. Before, an evening EXDATE moved to the wrong day. `IcsWriteEvent` and the input of `ics.write` get the optional field `tzid` (roadmap O57).
