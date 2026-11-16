# The writes of tenants in one collection (CLI-95)

This record gives the measures of the bench of the writes of tenants in one collection of `MongoDocumentStorage`. Each figure comes from a CI run of the workflow `stream-cost.yml`. Each pass is provisional, because the write rate of a tenant is a first guess.

## The question

All partitions of one collection share two things:

- the write queue of a process (`enqueue` in `document-storage.ts`), which also holds the change reads.
- one counter document on the server, which each write transaction increments as its first step.

The bench tells if these limit the number of tenants in one collection, with one process and with two or more.

## The bench

- The load is open-loop: each child writes on a seeded Poisson plan, so a slow store does not slow its own load.
- Each write is 1,000 bytes, to one tenant of one collection.
- The arm `control` writes the same load over 100 collections. It shows what the runner itself can do.
- A pass has no failure and a reply to each write. Each child writes at least 0.95 of its plan, and has a p99 of at most 1,000 ms.
- A driver that did not keep its schedule gives no reading.
- The first guess of the rate: each active tenant writes 0.2 times a second, and 10 percent of the tenants are active. So 20, 200 and 2,000 writes a second are 1,000, 10,000 and 100,000 tenants.

Each run has 3 jobs on a runner of 4 cores, with MongoDB on the same runner. A figure is the median over the children of a case.

## The rate of one collection

The CI record [41956238365](https://github.com/mark1russell7/client/actions/runs/41956238365) gives these figures:

| Rate | Processes | Reading | p50 | p99 | Conflicts |
|---|---|---|---|---|---|
| 20 w/s | 1, 2, 4 | provisional pass | | 6.7, 11.4, 13 ms | |
| 200 w/s | 1 | provisional pass | | 12 ms | |
| 200 w/s | 2 | provisional pass | 3.4 ms | 27.8 ms | 911 of 4,964 transactions |
| 200 w/s | 4 | provisional pass | | 39.5 ms | 1,390 of 5,374 transactions |
| 2,000 w/s | 1, 2 | fail | | | |

At 200 writes a second with two or more processes, one transaction in five retries on the counter. The median stays the same, and the p99 grows 2.3 to 3.3 times. A plain throughput figure does not show these retries.

## The limit of the collection and the limit of the runner

The CI record [41966001438](https://github.com/mark1russell7/client/actions/runs/41966001438) puts MongoDB and the writers on the same processors (shared) and on different processors (apart):

| Rate | Store | Control (100 collections) |
|---|---|---|
| 400 w/s | 397.2 w/s shared, pass, p99 414.8 ms | 400.1 w/s, pass, p99 13.9 ms |
| 800 w/s | 415.2 w/s shared, fail | 799.2 w/s, pass, p99 37.5 ms |
| 1,200 w/s | 412.6 w/s shared, fail | 1,180.3 w/s, no reading |

The store stops near 415 writes a second. At that rate its processors are busy 0.30 to 0.42 of the time, and the wait for the disk is at most 0.032. The control writes twice as much on the same runner. So the limit is the one collection, not the runner.

## The queue against the counter

The CI record [41973557472](https://github.com/mark1russell7/client/actions/runs/41973557472) (suite `tenant-separate`) writes 800 writes a second in one collection with four copies of the store:

- `store`: the code as it is.
- `noqueue`: no write queue in a process.
- `many`: 1,000 counter documents, with a random pick for each write.
- `neither`: both changes.

The copies are for the bench only. In `many`, a number is unique only inside its counter, so it is not a design. Each case also has a copy with the data of MongoDB on `tmpfs`, which removes the disk.

| Arm | 1 process | 2 processes | 1 process, tmpfs | 2 processes, tmpfs |
|---|---|---|---|---|
| `store` | 417 w/s, p50 9,121 ms, fail | 413 w/s, fail | 459 w/s, fail | 444 w/s, fail |
| `many` | 414 w/s, fail | 682 w/s, p50 1,733 ms, fail | 457 w/s, fail | 750 w/s, fail |
| `noqueue` | 25.9 w/s, no reading | 2 w/s, no reading | 29.5 w/s, no reading | 1.5 w/s, no reading |
| `neither` | 810 w/s, p99 30.8 ms, pass | 799 w/s, p99 25.2 ms, pass | 789 w/s, p99 24.9 ms, pass | 800 w/s, p99 40.1 ms, pass |

In `noqueue`, 88,485 of 89,067 transactions aborted with one process, and 103,331 of 103,386 with two.

- The queue of a process is the first limit. `store` and `many` stop at the same rate with one process. With two processes, `many` has two queues, and its rate grows to 682.
- The counter document is the limit behind the queue. Without the queue, the writes of one counter conflict, and almost each transaction aborts. So the queue keeps the counter free of conflicts.
- Only the change of both passes 800 writes a second.
- Without the disk, the rate grows by approximately 10 percent.

So a change of the limit must give each partition its own counter and its own queue (roadmap CLI-96).

## First loads of new tenants

The CI record [41995960494](https://github.com/mark1russell7/client/actions/runs/41995960494) adds first loads to the steady load of 200 writes a second with two processes. A first load is a burst of 72 writes in one second over 11 collections.

| First loads in one second | Slowest first load | p99 of the other tenants, store | p99 of the other tenants, control |
|---|---|---|---|
| 1 | 993 ms | 27 ms | 11.8 ms |
| 5 | | 40.8 ms | 12.7 ms |
| 10 | 1,336 ms (worst 1,619 ms) | 366 ms (worst 726.8 ms) | 17.9 ms (worst 42.6 ms) |

Ten first loads in one second hold the other tenants of the store behind the burst for approximately 1.3 seconds. The first loads take the same time on both arms.

## What these measures do not say

- The rate of a tenant is a guess. A measure of the writes of a real app replaces it.
- Each run used one CPU model (AMD EPYC 7763) on a runner of 4 cores.
- The bench writes documents of 1,000 bytes.

## How to start the bench

Start the workflow `stream-cost.yml` with the input `suite` set to `tenant`, `tenant-ceiling`, `tenant-separate` or `tenant-first`. The input `prediction` names the prediction that the run tests.
