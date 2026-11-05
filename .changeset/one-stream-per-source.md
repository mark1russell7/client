---
"@procedures/mongo": patch
---

`ViewMaterializer` keeps one change stream for each source, for all views of all partitions. The handler of the stream gives a change to the views of its partition. So the connections and the idle `getMore` commands do not grow with the partitions, and a start at 1,000 partitions on the default pool ends. At most one third of the pool (and at most 32) runs as passes at one time, so a burst that reaches each partition leaves connections for the other operations. A change during the wait of a pass moves the end of the wait and makes no new timer.
