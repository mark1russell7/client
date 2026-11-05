# The numbers of the document store (CLI-96)

Status: a design. A second run of the arm of a burst on a warm pool is open. The stated limit stays 200 writes a second on one collection until a gate holds a higher rate.

Each rate on this page comes from a runner with 4 cores, with MongoDB on the same runner. No rate is a limit of a larger machine.

## The problem

`MongoDocumentStorage` gives each write a number. A change read uses that number as its version. One collection has one counter, and each tenant of that collection shares it.

Run [41973557472](https://github.com/mark1russell7/client/actions/runs/41973557472) offered 800 writes a second to one collection:

| Arm | 1 process, w/s | 2 processes, w/s | Conflict share, 2 processes |
| --- | ---:| ---:| ---:|
| The store | 417 | 413 | 0.208 |
| Many counters, queue on | 414 | 682 | 0 |
| One counter, queue off | 25.9 (no reading) | 2 (no reading) | 0.999 |
| Many counters, queue off | 810 | 799 | 0.002 |

The arm with both changes met the 800 that the run offered. So 810 is the offer, not a ceiling.

The disk does not set this limit. The journal had 417 syncs a second at 0.198 ms each, and a store in memory gained only 1.10 times.

The mechanism has two serial points, and each holds one transaction at a time for a collection:

1. In one process, the queue of the collection. A write takes approximately 2.4 ms.
2. Across processes, the counter document. A transaction holds it until its commit.

## The rule

A reader that holds a version misses no write that ends after it read that version.

Each form below has a test of this rule. The test has two writer processes and one reader process on a real MongoDB. A hold of up to 20 ms inside each write lets the other processes pass a write in progress. A form with a counter outside the transaction and no watermark is the control, and it must lose writes. So the test proves that it finds a miss.

## What the queue protects

A form that removes the queue must replace two things:

1. **No conflict inside one process.** With the queue off and one counter, 99 % of the transactions conflict, and the rate falls to 25.9 w/s.
2. **The place of a change read in the process.** A change read goes behind the writes that the process started before it.

## The forms

| | A: a counter for each partition | B: a counter outside the transaction | C: the cluster time |
| --- | --- | --- | --- |
| Number | One counter document for each partition, in the transaction | One counter document, in its own step, with a list of pending numbers | A stamp from the cluster, or the token of a change stream |
| Serial point between partitions | None | The counter document, for one step | None |
| Round trips of one write | As today | 2 more | As today for a stamp, plus a stream for a token |
| A stalled writer holds back | Its own partition | All partitions, up to the write lease of 60 s | The stamp does not wait for it, so the stamp breaks the rule |
| Writes of one batch | One transaction | Not one transaction | One transaction |
| What replaces the queue | The queue stays, for each partition | A step on one document does not conflict, so no queue is necessary | Not applicable |
| The rule | Held: 0 of 20,991 lost | Held: 0 of 56,135 lost | A stamp lost 2 of 4, a token lost 0 of 4 |

### Form A

The counter moves from the collection to the partition. The queue moves with it. Two writes of different partitions then share no document, so they do not conflict. The arm with many counters had a conflict share under 0.01 at 682 w/s. Its 1,000 counters came at random, so two writes sometimes took one counter.

No store reads across partitions, because a store with no partition reads only documents with no partition. So a number must be in order only inside its partition.

The watcher of the writes of a process notes each number by collection. Under form A two partitions can use the same number, so the note takes the partition too.

A partition with many writes stays limited. Its counter is one document, as the counter of a collection is today. So one partition has the limit of one collection today, approximately 412 w/s, and two processes conflict on it. The cases `200-p2-hot` and `400-p2-hot` measure this.

### Form B

The store has this path already, for a host with no transactions. It removes the hold on the counter, and it keeps one document that all tenants write. A write takes two more round trips, and each read of the watermark reads the list of pending numbers.

A stalled writer stops the watermark of each tenant of the collection until its lease ends. Today a writer holds other writers for the time of one transaction. So form B makes the worst case of one tenant a cost for all tenants.

Form B as it stands is out, for two faults:

1. **It falls under overload.** It has no limit of writes in flight, and each write in flight is in the list of pending numbers of one document. Each step on that document gives back the whole list. At 800 writes a second on 2 processes, run [42008333464](https://github.com/mark1russell7/client/actions/runs/42008333464) gave 95.2 w/s and a p99 of 46.9 s. One child of that run gave 801.8 w/s. So the rate has two stable states, and a table with one number for each row hides that.
2. **It loses the order of one id.** Two writes of one id can end in the wrong order. Run [42028437593](https://github.com/mark1russell7/client/actions/runs/42028437593) found 39 wrong values for a new id and 105 for an existing id. With a hold in flight, it found 180 of 180.

### Form B with a bound and a rule for each id

A bound of 16 writes in flight in each process stops the fall. The value 16 comes from Little's law on the control at 800 writes a second. A p99 of 36.4 ms gives 14.6 writes in flight in a process. Bounds of 8, 16 and 32 all kept up at that rate.

The bound alone does not fix the order. With a hold in flight, it also has 180 wrong of 180. Its 0 with no hold is the result of a short queue, and it is not a proof. So a rule for each id does this work. A write of an id waits for the write before it of that id, in its process. This rule reads 0 in each of the four rows of the order run. The bound without the rule proves nothing there.

The rule costs one step on a map for each write. This run does not separate a further cost from the noise:

| Case | Job | p50 with no rule, ms | p50 with the rule, ms | Children that held the schedule, no rule and rule |
| --- | --- | ---:| ---:| --- |
| `800-p2` | 3 | 12.7 | 13.1 | 9 of 9, 3 of 3 |
| `800-p2` | 1 | 89.3 | 58.4 | 1 of 9, 1 of 3 |
| `800-p2` | 2 | 55.1 | 189.6 | 8 of 9, 2 of 3 |
| `400-p2-hot` | 3 | 4.6 | 4.6 | 9 of 9, 3 of 3 |
| `400-p2-hot` | 1 | 5.7 | 5.7 | 9 of 9, 3 of 3 |

The pooled p50 of `800-p2` is 33.2 ms against 58.4 ms. This run does not separate that difference from the noise, because inside job 2 the children of one arm go from 6.6 ms to 2,526 ms. So the order read decides this rule, and its cost does not.

The rule sets the rate of one id. Writes of one id go one at a time in a process, so one id gets the limit that a whole collection has today:

| Writes a second on one id, 2 processes | Children at 95 percent of the plan or more | p50 | Result |
| ---:| ---:| ---:| --- |
| 200 | 8 of 9 | 3.8 ms to 315 ms | Keeps up on 2 jobs. On job 2, 2 of 3 children have a p99 over 1,000 ms, and the control has one too |
| 400 | 5 of 9 | 8 ms to 7.2 s | Job 3 has a p50 of 8 ms to 10 ms. The other jobs have 178 ms to 7.2 s |
| 800 | 0 of 9 | 7.4 s to 15.8 s | 297 to 462 w/s. One child has 2,287 writes with no reply at the end |

The chain of an id has no limit. So a burst on one id waits in the memory of the process. A p50 of 7.4 s to 15.8 s is not a result to ship as a default, so the refusal below is a condition of this queue.

This form also has these faults:

- A batch is not one transaction, and today it is one on a replica set. A caller can see this change.
- A stalled writer holds back all tenants of the collection, up to the lease of 60 s.
- A write past its lease can come two times. Today only a store with no transactions has this case.
- The first write of one new id from two processes can fail with a duplicate key. Run [42028465046](https://github.com/mark1russell7/client/actions/runs/42028465046) has 4 such failures. A store with no transactions has this fault today, and CLI-103 fixes it.
- The one document stays a serial point. At 1,200 writes a second on 4 processes, the bound gave 813.7 w/s, with a p50 of 4.5 s.

### Form C

A stamp comes before the commit. A write with an older stamp can end after a reader passed that stamp, and the reader then misses it. The test shows this in fixed steps.

The token of a change stream follows the order of the commits, so it holds the rule. But it changes the version for each caller, it needs a stream on the server, and it lasts only as long as the oplog window.

## The readings

| Case | Today | Form A | Form B | Form B with the bound | Stated in |
| --- | ---:| ---:| ---:| ---:| --- |
| `800-p2`, w/s and p99 | 367.5, 23.1 s | 802.2, 40.7 ms | 95.2, 46.9 s | 797.1, 87.8 ms | [41994748659](https://github.com/mark1russell7/client/actions/runs/41994748659), [42008333464](https://github.com/mark1russell7/client/actions/runs/42008333464) |
| `1200-p4`, w/s | 384.3 | 1,183 | 149.8 | 813.7 | The same runs |
| `400-p2-hot`, w/s and p99 | 352.8, 3.2 s | 361.6, 2 s | 402.3, 28.8 ms | 401.8, 26.6 ms | The same runs |
| `200-p2-first10`, children that held the schedule | 54 of 54 | 7 of 9 | 3 of 9 | 4 of 9 | [42018534644](https://github.com/mark1russell7/client/actions/runs/42018534644) |
| `200-p4-first10`, children that held the schedule | 39 of 54 | 5 of 9 | 3 of 9 | 3 of 9 | The same run |

Form A at 1,200 writes a second did not hold its schedule, and the control did not too. So the runner sets that limit, and 1,183 is the rate of a run with no reading. The control with many counters and no queue gave 1,179.8 w/s there.

The other callers of a first load tell the same story. On `200-p2-first10`, the p99 of the writes of other tenants is 359 ms today. It is 26 ms on form A, 210 ms on form B and 121 ms on the bound. The control has 16 ms.

Form A does not close the first load on a cold pool, because 2 of 9 children miss the schedule, with 107 ms and 148 ms. Form A and the bound both make connections in the burst, and the control starts with a warm pool.

### A burst of first loads on a warm pool

Run [42031147834](https://github.com/mark1russell7/client/actions/runs/42031147834) reads each form on a cold pool and on a warm pool. A warm pool has 30 connections before the load, with `minPoolSize`. Each cell gives the median child of 3 jobs. The driver column also gives the least and the worst child. Each case has a rate of 200 writes a second, on 4 cores with MongoDB on the runner.

| Case | Form | Children that held the schedule | Driver worst, ms | Loop p99, ms | Command p50 and p99, ms | Connections made | Others p99, ms | Others p99 after the send, ms | First load, ms |
| --- | --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|
| 2 processes, cold | Today | 36 of 36 | 12.6 (1.9 to 59.7) | 8.0 | 2, 7 | 9 | 386.0 | 384.8 | 1,298 |
| 2 processes, cold | A | 8 of 9 | 39.8 (2.8 to 130.9) | 9.5 | 2, 9 | 11 | 30.7 | 14.2 | 1,008 |
| 2 processes, cold | Bound | 5 of 9 | 97.9 (8.4 to 172.3) | 12.1 | 7, 21 | 18 | 145.2 | 95.9 | 1,166 |
| 2 processes, warm | Today | 36 of 36 | 20.5 (2.0 to 58.4) | 8.6 | 2, 8.5 | 0 | 426.4 | 426.6 | 1,333 |
| 2 processes, warm | A | 9 of 9 | 23.6 (2.0 to 74.0) | 8.8 | 2, 9 | 0 | 18.4 | 14.4 | 1,004 |
| 2 processes, warm | Bound | 4 of 9 | 115.7 (5.6 to 169.5) | 14.2 | 7, 21 | 0 | 148.8 | 111.9 | 1,186 |
| 4 processes, cold | Today | 32 of 36 | 55.1 (3.1 to 122.1) | 16.4 | 4, 17 | 10 | 757.9 | 753.2 | 1,669 |
| 4 processes, cold | A | 5 of 9 | 63.0 (5.2 to 203.0) | 14.8 | 3, 16 | 10 | 28.6 | 25.5 | 1,010 |
| 4 processes, cold | Bound | 3 of 9 | 263.4 (18.5 to 407.0) | 26.8 | 10, 43 | 18 | 198.0 | 71.1 | 1,200 |
| 4 processes, warm | Today | 33 of 36 | 35.5 (1.9 to 126.3) | 12.9 | 3, 14 | 0 | 675.6 | 674.2 | 1,616 |
| 4 processes, warm | A | 9 of 9 | 13.4 (2.2 to 84.7) | 9.7 | 1, 11 | 0 | 20.7 | 20.0 | 1,005 |
| 4 processes, warm | Bound | 3 of 9 | 157.8 (3.6 to 328.9) | 21.3 | 8, 30 | 0 | 113.0 | 41.7 | 1,076 |

The plan of a first load is 1,000 ms.

**On a warm pool, form A has no miss.** It holds 18 of 18 children on a warm pool, and 13 of 18 on a cold pool in this run. So form A answers the first load on a warm pool, and it does not answer it on a cold pool. The 18 of 18 comes from one run, and at 95 percent it holds the share of children that miss only under 16 percent. A second run repeats the arm.

**The warm pool is a setting of the host.** The store does not own the connections, so `minPoolSize` belongs to the client that the host gives the store. This run reads a pool of 30, and no smaller pool. The cost is small in the second before the burst: the busy share of a writer changes by at most 0.01 between cold and warm.

**A warm pool does not close the miss of the bound.** The bound holds 7 of 18 children with 0 connections made. At 2 processes, its driver worst is 115.7 ms warm against 97.9 ms cold. So connections do not cause this lateness. The run does not name the full cause.

The server counts 1,439 write conflicts in the median child of the bound at 2 processes warm. Form A has 0 there. The median command of the bound takes 7 milliseconds, and the median command of form A takes 2 milliseconds. Of the 7 children that held, 6 are on one CPU model of the 3 in this run. So the read of the bound depends on the runner.

**Where each form pays, at 2 processes on a warm pool:**

- **Today pays in the writer.** The others p99 is 426.4 ms, and all of it comes after the send. A command p99 is 8.5 ms. So the wait is in the queue of the process.
- **Form A pays little in either place.** The others p99 is 18.4 ms, with 14.4 ms after the send. A command p99 is 9 ms and the loop p99 is 8.8 ms. A command time includes the wait of the loop for the reply, so this run cannot split a time under 9 ms.
- **The bound pays after the send.** The others p99 is 148.8 ms, with 111.9 ms after the send and 36.9 ms before it. The run does not split the wait for the bound from the time in MongoDB.

### The rule, for each form and each release case

Run [42014963086](https://github.com/mark1russell7/client/actions/runs/42014963086) has 6 rounds for each case with two writers. Each round has 15 s of writes:

| Case | Replies | Writes lost | Expected |
| --- | ---:| ---:| --- |
| `today` | 6,183 | 0 | None |
| `control-outside` | 10,719 | 8,509 | Some |
| `forma` | 20,991 | 0 | None |
| `formb` | 56,135 | 0 | None |
| `formbbound` | 72,753 | 0 | None |
| `release-forma-new-reader` | 30,668 | 2,097 | Some |
| `release-forma-old-reader` | 30,135 | 21,421 | Some |
| `forma-guard-quiet` | 22,215 | 0 | None |
| `release-forma-guard` | 28,830 | 0 | None |
| `release-formb-new` | 18,020 | 0 | None |
| `release-formb-old` | 18,690 | 0 | None |
| `release-formbbound-new` | 31,811 | 0 | None |
| `release-formbbound-old` | 29,570 | 0 | None |
| `formc-stamp` | 4 | 2 | Some |
| `formc-stream` | 4 | 0 | None |

The control lost writes, so the test can find a loss. A count of 0 is a result for these rounds and this hold of up to 20 ms. It is not a proof for each order of steps.

## The proposal

**Form A, with an option of the store, on by choice for each collection.** The default stays one counter for each collection.

- A collection that has no writes starts with a counter for each partition. It has no old reader, so its release has no step that can lose a read.
- A store with the option refuses a collection with numbers on its counter of the collection. It gives a clear error. A move of a live collection is a stated step with all processes stopped. That step has its own item (CLI-104), with its own test and the date 2026-11-19.
- The plan below for a rolling move is not in this proposal. Its guard cannot protect an old reader: the run lost 21,421 writes in 30,135 replies with no sign.

The reasons:

1. It has no shared document between tenants. It is the only form with a rate that can grow with more processors, and the other forms have a limit on one document.
2. The queue stays for each partition. So the order of one id, a batch as one transaction and a write of one process before a read all stay as they are.
3. A stalled writer holds only its own partition.
4. No caller changes. The option is new, so a release has no break.

What it does not give:

- One partition keeps the limit of one collection today, approximately 412 w/s. The case `400-p2-hot` gave a p99 of 2 s. So the stated limit of a partition is 200 writes a second.
- A collection with no partitions gains nothing, so it keeps the stated limit of 200.
- A live collection gains nothing. The page and the changeset of form A say this in these words. The stopped move of CLI-104 is the only way out of this limit.
- A cold pool keeps the miss of a first load. A host gets the result above only with `minPoolSize`, and the changeset of form A says this too.
- No form holds 2,000 writes a second on these runners, the rate of the rung of 100,000 tenants.

**Overload.** All forms need a stated limit. A queue of a partition with no limit waits in memory, and a caller sees a long wait with no error. A write past a limit of waiting writes gets a clear error at once. The limit comes from an arm with a prediction first. A new error is a change that a caller can see, so it ships as its own MINOR. This part joins the design of the overload of change events (CLI-102).

## The rolling move of a live collection, not proposed

A rolling release runs old and new processes on one collection. Old processes write to the counter of the collection. New readers read the counter of the partition. So a release with no guard loses reads. Run 42014963086 shows this in two cases: `release-forma-new-reader` lost 2,097 writes in 30,668 replies, and `release-forma-old-reader` lost 21,421 in 30,135. The same run gives no loss for form B with an old or a new reader, so form B needs no flag for its release. A rolling move of form A has four steps:

1. **Release N reads a flag and does not use it.** The counter document of the collection gets a flag. The `$inc` of a write returns it, so the flag costs no round trip.
2. **All processes run N or later.** The operator confirms this. The store cannot see the versions of the other processes.
3. **The first move of a collection.** One step sets the flag and records the frozen number. A transaction of an old path that is open at this step conflicts and retries, and so it reads the flag.
4. **Each counter of a partition starts at the frozen number, with the same epoch.** So a version that a reader holds stays valid, and no reader needs a full read.

A guard covers an old process that lives past step 2. A change read also reads the counter of the collection, in the same query as the counter of the partition. A number above the frozen number means that an old writer is alive. The read then gives a full result and a warning. Recovery sets a new epoch, so each reader takes a full read.

The guard has its own case in the test of the rule, and `release-forma-guard` lost 0 writes in 28,830 replies. A reader then reads the full result for each read while an old writer is alive: 14,083 later full results against 5 deltas. The guard is in the reader, so it does not help an old reader. An old reader reads only the counter of the collection, and new writers do not change that counter. `release-forma-old-reader` gives this loss. So this move depends on step 2 for each reader, and a breach of step 2 loses reads with no sign. That is the reason that the proposal has no rolling move.

## SemVer

The option of form A is a new optional field, with a default that keeps the behavior. So it is a PATCH of the group. The numbers of two partitions can be equal, but only for a collection that chose the option. The refusal under overload changes what a caller of an existing collection sees, so it is its own MINOR, merged alone. The choice goes to the release owner with the readings above.
