# The numbers of the document store (CLI-96)

Status: a design with open readings. The stated limit stays 200 writes a second on one collection until a gate holds a higher rate.

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

1. In one process, the queue of the collection. A write takes about 2.4 ms.
2. Across processes, the counter document. A transaction holds it until its commit.

## The rule

A reader that holds a version misses no write that ends after it read that version.

Each form below has a test of this rule. The test has two writer processes and one reader process on a real MongoDB. A hold of up to 20 ms inside each write lets the other processes pass a write in progress. A form with a counter outside the transaction and no watermark is the control, and it must lose writes. So the test proves that it finds a miss.

## What the queue protects

A form that removes the queue has to replace two things:

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
| The rule | Holds in a transaction, to test | Holds through the watermark, to test | A stamp fails, a token holds, to test |

### Form A

The counter moves from the collection to the partition. The queue moves with it. Two writes of different partitions then share no document, so they do not conflict. The arm with many counters had a conflict share under 0.01 at 682 w/s. Its 1,000 counters came at random, so two writes sometimes took one counter.

No store reads across partitions, because a store with no partition reads only documents with no partition. So a number needs to be in order only inside its partition.

The watcher of the writes of a process notes each number by collection. Under form A two partitions can use the same number, so the note takes the partition too.

A partition with many writes stays limited. Its counter is one document, as the counter of a collection is today. So one partition has the limit of one collection today, about 412 w/s, and two processes conflict on it. The cases `200-p2-hot` and `400-p2-hot` measure this.

### Form B

The store has this path already, for a host with no transactions. It removes the hold on the counter, and it keeps one document that all tenants write. A write takes two more round trips, and each read of the watermark reads the list of pending numbers.

A stalled writer stops the watermark of each tenant of the collection until its lease ends. Today a writer holds other writers for the time of one transaction. So form B makes the worst case of one tenant a cost for all tenants.

### Form C

A stamp comes before the commit. A write with an older stamp can end after a reader passed that stamp, and the reader then misses it. The test shows this in fixed steps.

The token of a change stream follows the order of the commits, so it holds the rule. But it changes the version for each caller, it needs a stream on the server, and it lasts only as long as the oplog window.

## First view

Form A, if its arm reads as predicted. The numbers of the arms decide this, and the table below takes them.

| Reading | Run | Value |
| --- | --- | --- |
| Rates of each form, offered until it stops keeping up | [41983359376](https://github.com/mark1russell7/client/actions/runs/41983359376) | Not read yet |
| The rule, for each form and each release case | [41983282157](https://github.com/mark1russell7/client/actions/runs/41983282157) | Each of the 10 cases gave its expected result. The table below has the counts |

The test of the rule ran 2 jobs of 3 rounds for each case with two writers. Each round had 15 s of writes:

| Case | Replies | Writes lost | Expected |
| --- | ---:| ---:| --- |
| `today` | 6,928 | 0 | None |
| `control-outside` | 13,018 | 10,116 | Some |
| `forma` | 24,731 | 0 | None |
| `formb` | 62,551 | 0 | None |
| `release-forma-new-reader` | 32,335 | 1,156 | Some |
| `release-forma-old-reader` | 32,244 | 18,908 | Some |
| `release-formb-new-reader` | 21,392 | 0 | None |
| `release-formb-old-reader` | 21,783 | 0 | None |
| `formc-stamp` | 4 | 2 | Some |
| `formc-stream` | 4 | 0 | None |

The control lost writes, so the test can find a loss. A count of 0 is a result for these rounds and this hold of up to 20 ms. It is not a proof for each order of steps.

The guard of form A has no case yet, so this table does not cover the release of form A with its guard.

## The release plan of form A

A rolling release runs old and new processes on one collection. Old processes write to the counter of the collection. New readers read the counter of the partition. So a release with no guard loses reads. Run 41983282157 shows this in two cases: `release-forma-new-reader` lost 1,156 writes in 32,335 replies, and `release-forma-old-reader` lost 18,908 in 32,244. The same run gives no loss for form B with an old or a new reader, so form B needs no flag for its release. The plan of form A has four steps:

1. **Release N reads a flag and does not use it.** The counter document of the collection gets a flag. The `$inc` of a write returns it, so the flag costs no round trip.
2. **All processes run N or later.** The operator confirms this. The store cannot see the versions of the other processes.
3. **The first move of a collection.** One step sets the flag and records the frozen number. A transaction of an old path that is open at this step conflicts and retries, and so it reads the flag.
4. **Each counter of a partition starts at the frozen number, with the same epoch.** So a version that a reader holds stays valid, and no reader needs a full read.

A guard covers an old process that lives past step 2. A change read also reads the counter of the collection, in the same query as the counter of the partition. A number above the frozen number means that an old writer is alive. The read then gives a full result and a warning. Recovery sets a new epoch, so each reader takes a full read.

The guard has its own case in the test of the rule before this form ships.

## SemVer

Not decided. The version text stays `<epoch>.<number>`, and the results inside a partition stay the same. The numbers of two partitions can now be equal, and that is visible to a caller that compares versions across partitions. The plan with its choice goes to the release owner with the readings above.
