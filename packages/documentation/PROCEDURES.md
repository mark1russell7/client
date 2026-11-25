# Mark Ecosystem Procedure Catalog

> **Generated file — do not hand-edit.** Produced by `packages/documentation/scripts/generate-procedures.ts`
> from the live `PROCEDURE_REGISTRY` (introspected after importing every built package's
> `register.js`). Regenerate with `node packages/documentation/scripts/generate-procedures.ts`.

**Total procedures:** 612 across 59 namespaces. Loaded 55 package register(s).

## Namespaces

- [`_discovery.*`](#_discovery) — 1 procedure(s)
- [`algebra.*`](#algebra) — 44 procedure(s)
- [`archive.*`](#archive) — 3 procedure(s)
- [`claude.*`](#claude) — 4 procedure(s)
- [`cli.*`](#cli) — 1 procedure(s)
- [`client.*`](#client) — 16 procedure(s)
- [`csv.*`](#csv) — 2 procedure(s)
- [`cue.*`](#cue) — 5 procedure(s)
- [`dag.*`](#dag) — 9 procedure(s)
- [`docker.*`](#docker) — 25 procedure(s)
- [`ecosystem.*`](#ecosystem) — 1 procedure(s)
- [`env.*`](#env) — 3 procedure(s)
- [`exif.*`](#exif) — 1 procedure(s)
- [`fs.*`](#fs) — 15 procedure(s)
- [`generators.*`](#generators) — 23 procedure(s)
- [`geo.*`](#geo) — 52 procedure(s)
- [`gh.*`](#gh) — 16 procedure(s)
- [`git.*`](#git) — 46 procedure(s)
- [`handle.*`](#handle) — 2 procedure(s)
- [`http.*`](#http) — 4 procedure(s)
- [`ics.*`](#ics) — 4 procedure(s)
- [`iosBackup.*`](#iosBackup) — 3 procedure(s)
- [`json.*`](#json) — 5 procedure(s)
- [`lib.*`](#lib) — 6 procedure(s)
- [`llm.*`](#llm) — 3 procedure(s)
- [`logs.*`](#logs) — 2 procedure(s)
- [`mail.*`](#mail) — 2 procedure(s)
- [`manifest.*`](#manifest) — 1 procedure(s)
- [`mcp.*`](#mcp) — 2 procedure(s)
- [`mongo.*`](#mongo) — 20 procedure(s)
- [`node.*`](#node) — 5 procedure(s)
- [`notify.*`](#notify) — 6 procedure(s)
- [`npm.*`](#npm) — 7 procedure(s)
- [`ocr.*`](#ocr) — 2 procedure(s)
- [`optional.*`](#optional) — 20 procedure(s)
- [`pdf.*`](#pdf) — 1 procedure(s)
- [`pnpm.*`](#pnpm) — 12 procedure(s)
- [`predicates.*`](#predicates) — 13 procedure(s)
- [`privacyScan.*`](#privacyScan) — 2 procedure(s)
- [`procedure.*`](#procedure) — 13 procedure(s)
- [`program.*`](#program) — 4 procedure(s)
- [`quantity.*`](#quantity) — 31 procedure(s)
- [`rational.*`](#rational) — 24 procedure(s)
- [`restic.*`](#restic) — 1 procedure(s)
- [`s3.*`](#s3) — 13 procedure(s)
- [`schedule.*`](#schedule) — 4 procedure(s)
- [`sdk.*`](#sdk) — 2 procedure(s)
- [`server.*`](#server) — 8 procedure(s)
- [`shell.*`](#shell) — 4 procedure(s)
- [`snapshot.*`](#snapshot) — 5 procedure(s)
- [`splay.*`](#splay) — 2 procedure(s)
- [`sqlite.*`](#sqlite) — 16 procedure(s)
- [`statistics.*`](#statistics) — 82 procedure(s)
- [`systems.*`](#systems) — 1 procedure(s)
- [`tailscale.*`](#tailscale) — 1 procedure(s)
- [`vite.*`](#vite) — 4 procedure(s)
- [`vitest.*`](#vitest) — 5 procedure(s)
- [`weather.*`](#weather) — 1 procedure(s)
- [`yaml.*`](#yaml) — 2 procedure(s)

---

## _discovery

| Procedure | Description |
|-----------|-------------|
| `_discovery.announce` | Exchange procedure manifests for discovery |

## algebra

| Procedure | Description |
|-----------|-------------|
| `algebra.acceptQueueHeld` | This function gives the connections that a full accept queue holds: its limit plus one. |
| `algebra.acceptQueueLimit` | This function gives the limit of the accept queue: the backlog of listen(2), clamped to `somaxconn`. |
| `algebra.algebraProblems` | This function gives what in a document the algebra cannot read: arithmetic that does not parse, or a model that it does not have. |
| `algebra.arr` | This function gives one value or many values as an array. |
| `algebra.conntrackFloor` | This function gives the lowest count of one network namespace after one scan of the conntrack collector under pressure. Each entry of the table can go at that scan. The sources are Linux v7.0, `net/netfilter/nf_conntrack_core.c`. |
| `algebra.detection` | This function gives the detection: the minimum over the detectors that are live in the situation. The entry to the state arms a timer, and so does what the failure causes: data in flight without an acknowledgment gets a retransmission. An event that occurs cancels a timer. |
| `algebra.errnoOf` | This function gives the errno of a detection by a timer: the errno of the transition that its event takes from the state. A soft error of the manifestation replaces ETIMEDOUT, but only for the timers whose segments its ICMP quotes in the window. |
| `algebra.evaluate` | This function evaluates one duration of a timer of a machine, in the unit that its document gives it. The waits of a backoff timer read `fired`, which tells which wait. |
| `algebra.exprKnobs` | This function gives the knobs that a duration reads, by the names of the machine for them. |
| `algebra.fifoDefaultLimit` | This function gives the limit of a pfifo or a bfifo with no limit of its own (`net/sched/sch_fifo.c`, lines 106-112). A pfifo holds `txqueuelen` packets. A bfifo holds `txqueuelen` times the MTU plus the link header, in bytes (`psched_mtu`, `include/net/pkt_sched.h`, lines 131-134). A pfifo drops a packet when it holds its limit. A bfifo drops a packet that puts its bytes above its limit (lines 19-36). |
| `algebra.firings` | This function gives the firings of a backoff timer on a timeline: the sum of its waits, exactly, from the wait `from`. It stops at the first wait that is not a known amount, or at a stop of the options, or after 4096 firings. Each time is the duration of the waits, without how early or late each can fire. |
| `algebra.fromStates` | This function gives the states that a transition leaves. The state "*" is each state that is not final. |
| `algebra.gsoQdiscLength` | This function gives the qdisc length of a GSO packet of `length` bytes in `segments` segments. Each segment after the first adds `headers` bytes: the link, network and transport headers of one segment (`net/core/dev.c`, lines 4119-4158). |
| `algebra.machineProblems` | This function gives the problems in the consistency of a document. Each state, event, timer and knob that it refers to must exist, and it must have an initial state. A reader refuses a machine with problems, and does not draw half of it. |
| `algebra.memcgHighDelay` | This function gives the delay of a debt of `debt` pages, in jiffies, before the cap and the skip. It is the delay of the largest overage of memory plus the delay of the largest overage of swap. The table in the comment of the source gives this delay (lines 2145-2171): 6 ms at 1% over a high of 100 MiB. |
| `algebra.memcgHighSleep` | This function gives the jiffies that a task sleeps when it pays a debt of `debt` pages. The sleep is the delay of `memcgHighDelay` with the cap of 2 s. A delay of 10 ms or less gives no sleep. `memory` is the cgroup of the task, then each ancestor below the root. `swap` gives the same for `memory.swap.high`. |
| `algebra.memcgSleepBounds` | This function gives two usages above `high` for a debt of `debt` pages. The first is the lowest usage that gives a sleep. The second is the lowest usage whose sleep is the cap of 2 s. The sleep does not go down as the usage goes up, thus a search finds each bound. Take a high of 25,600 pages (100 MiB), HZ 1000 and a debt of 64. The sleep starts at 25,936 pages (1.3% over), and the cap starts at 30,126 (17.7% over). |
| `algebra.memcgThrottle` | This function gives the throttle of a task that grows by `charges` charges of `batch` pages each. It starts from the usage of each level in `levels`: the cgroup of the task, then each ancestor below the root. Each charge adds `batch` pages to each level, and the task pays its debt of `batch` pages before the next charge. A task that touches one page at a time charges a batch of 64 at each 64th page. |
| `algebra.modelSource` | This function gives the source of the formula of a named model, for a reader of a result. |
| `algebra.netemPacketTime` | This function gives the time that netem gives a packet of `length` bytes at its rate, in nanoseconds (`packet_time_ns`, lines 357-370). It rounds down. A packet of 1,514 bytes at 10 Mbit/s (1,250,000 bytes per second) takes 1,211,200 ns. |
| `algebra.netemSchedule` | This function gives the outcome of each packet in a netem queue with a rate. A packet that the queue takes leaves at `max(last, at + latency) + time`. `last` is the time to send of the packet before it, and `time` is the time of `netemPacketTime`. The queue holds each packet until it leaves, thus a delay of 100 ms at 1,000 packets per second fills a limit of 100. |
| `algebra.oomBadness` | This function gives the points of a task for the OOM killer. The points are its resident pages, its swap entries and the pages of its page tables. To this sum, the kernel adds `oom_score_adj` times `totalPages / 1000`, in integer arithmetic. A task at −1000 gives undefined, because the OOM killer does not take it. |
| `algebra.oomVictim` | This function gives the index of the task that the OOM killer of a cgroup takes: the task with the most points. Of tasks with equal points, the last one in the order of the scan wins (`mm/oom_kill.c`, lines 342-351). A task replaces the choice unless its points are less. It gives undefined when the OOM killer can take no task. |
| `algebra.parseExpr` | This function parses the arithmetic of a document, or it throws an error that tells where the text stops making sense. |
| `algebra.portSearchChain` | This function gives the exact chain of the search: the share of each count of connects to one destination, over `rounds` rounds. Each round closes its connections with a reset, and the next round starts where the last connect of the round before put the start. The first round starts at each even offset with the same chance. |
| `algebra.portSearchShares` | This function gives the law of the search: the share of each count of connects to one destination before `EADDRNOTAVAIL`, over `rounds` rounds. An even range, and a range of one port, give their size in each round: the two passes reach each port. An odd range gives its size or one less, from the exact chain, up to `PORT_SEARCH_CHAIN_LARGEST` ports. |
| `algebra.portSearchSpan` | This function gives the size that the search reads: the size of the range, rounded down to an even number. |
| `algebra.probeTrain` | This function gives the times of a train of probes, exactly, in seconds. The first probe is at `first`, and each next probe is one `interval` later, `count` probes in all. A first time without an end gives no probe. An interval without an end gives only the first probe. Keepalive at its defaults sends its probes at 7200 s, 7275 s, and so on to 7800 s. |
| `algebra.pschedFactor` | This function gives the factor of a rate in bytes per second (`psched_ratecfg_precompute__`). The kernel doubles a factor of 10^9 until the quotient by the rate fills 32 bits. At 125,000 bytes per second, `mult` is 4,194,304,000 and `shift` is 19. |
| `algebra.pschedLengthTime` | This function gives the time of `length` bytes at a rate of the packet scheduler, in nanoseconds (`psched_l2t_ns`). The kernel multiplies by its factor and does not divide. Thus a time can be 1 ns short: 1,500 bytes at 3,000,000 bytes per second give 499,999 ns, not 500,000. |
| `algebra.readsFired` | This function tells if a duration reads the number of times that its timer fired, as the waits of a backoff do. |
| `algebra.realizationKnobs` | This function gives the knobs that a realization reads, by the names of the machine for them. |
| `algebra.realizationOf` | This function gives how long a mechanism takes where a machine operates, from the realization of its document. The realization is one of its timers, whole, or its own duration, lateness and early bound over the knobs of the machine. It gives undefined when the document does not realize the mechanism. |
| `algebra.recovery` | This function gives the recovery from a stall. A backoff timer continues to fire through a stall, and what each firing sends gets through only after the stall ends. Thus the connection moves again at the first firing at the end or after it. That firing can be most of a wait after the end. A stall that stops immediately after one firing costs almost all of the next, longer wait. |
| `algebra.replay` | This function replays a trace against a machine document, and it gives each disagreement: - Each instance starts in the state that its first transition leaves. - Each transition must leave the state where the replay of its instance is, and that state must be in the document. - The document must have a transition from that state, on that event, to that state. The state "*" is each state that is not final. |
| `algebra.stackedDetection` | This function gives the detection through the machine that a machine operates on. The detectors of the lower machine are live in the state below the state of this machine. They use the knobs that this machine sets. |
| `algebra.synGiveUpSends` | This function gives the SYNs that a connect sends before it gives up: the first SYN and each retransmission (`synGiveUpWaits`). A connect whose SYN does not leave adds each of them to the field `drop` of conntrack, and each retransmission to `TCPRetransFail`. |
| `algebra.tbfBuckets` | This function gives the depths of the buckets of a tbf qdisc and its largest packet. |
| `algebra.tbfSchedule` | This function gives the outcome of each packet in a tbf qdisc. The buckets are full at the first arrival. A packet leaves at the first time after its arrival and after the packet before it, when the tokens of each bucket cover its time. After it leaves, each bucket loses its time. A bucket gains one token for each nanosecond, up to its depth. |
| `algebra.timerBand` | This function gives the band of a timer from its bounds, exactly, in `unit`. The band goes from its duration less its early bound to its duration plus its lateness. A bound that the document does not give is zero. A duration without an end gives a band without an end. A keepalive of 11 s, 4 ms early and 352 ms late, gives 10.996 s to 11.352 s. |
| `algebra.timerOf` | This function gives the bounds of a timer of a machine: how long it operates, how late it can fire, how early. For a backoff timer, it gives one of its waits: the wait after `fired` firings. |
| `algebra.timerUnder` | This function gives the bounds of a timer of a machine under a failure: its own bounds, with each duration that the manifestation replaces. |
| `algebra.transitionOn` | This function gives the transition that a machine takes from a state on an event, by its document. |
| `algebra.udpFrameLength` | This function gives the qdisc length of one UDP datagram of `payload` bytes on an Ethernet device or a veth. It adds the Ethernet header of 14 bytes, the IP header and the UDP header of 8 bytes. The IP header is 20 bytes for IPv4 and 40 bytes for IPv6, with no options. |

## archive

| Procedure | Description |
|-----------|-------------|
| `archive.create` | Make a tar.gz or zip archive of a folder or of files |
| `archive.extract` | Extract a tar.gz or zip archive into a folder, with a check of each path |
| `archive.list` | The entries of a tar.gz or zip archive |

## claude

| Procedure | Description |
|-----------|-------------|
| `claude.cancel` | Stop a turn and the processes that it started |
| `claude.follow` | Follow the output file of a turn and stream its events until the turn ends |
| `claude.read` | Read the new events of a turn from its output file |
| `claude.start` | Start one turn of the Claude Code CLI as a detached process that writes to a file |

## cli

| Procedure | Description |
|-----------|-------------|
| `cli.run` | Run a mark CLI command |

## client

| Procedure | Description |
|-----------|-------------|
| `client.all` | Returns true if all values are truthy |
| `client.and` | Short-circuit AND (returns first falsy or last value) |
| `client.any` | Returns true if any value is truthy |
| `client.chain` | Execute procedures sequentially |
| `client.conditional` | Conditional execution (if/then/else) |
| `client.constant` | Return a constant value |
| `client.identity` | Return input unchanged |
| `client.map` | Map over an array: run fn for each item (the item is { $ref: "item" }) |
| `client.none` | Returns true if all values are falsy |
| `client.not` | Logical NOT of a value |
| `client.or` | Short-circuit OR (returns first truthy or last value) |
| `client.parallel` | Execute procedures in parallel |
| `client.reduce` | Reduce an array: run fn for each item (acc and item are $refs) |
| `client.throw` | Throw an error |
| `client.trace` | Run the steps of a chain one at a time, and give one row for each step. A step that can write does not run. |
| `client.tryCatch` | Try/catch wrapper for procedures |

## csv

| Procedure | Description |
|-----------|-------------|
| `csv.parse` | Parse CSV text into rows |
| `csv.stringify` | Write rows as CSV text |

## cue

| Procedure | Description |
|-----------|-------------|
| `cue.add` | Add a feature to dependencies.json |
| `cue.generate` | Generate config files from dependencies.json |
| `cue.init` | Initialize dependencies.json with a preset |
| `cue.remove` | Remove a feature from dependencies.json |
| `cue.validate` | Validate dependencies.json |

## dag

| Procedure | Description |
|-----------|-------------|
| `dag.buildLeveledDAG` | This function builds a leveled DAG from nodes, with Kahn's algorithm. |
| `dag.buildNodeMap` | This function builds a Map of nodes from an array. |
| `dag.createNode` | This function makes a DAG node from a minimal input. |
| `dag.filterDAGFromRoot` | This function filters a DAG to the nodes that a root can reach. |
| `dag.getAncestors` | This function gives all ancestors of a node: the nodes that this node depends on, transitively. |
| `dag.getDescendants` | This function gives all descendants of a node: the nodes that depend on this node, transitively. |
| `dag.getTopologicalOrder` | This function gives the topological order: a flat list, leaves first. |
| `dag.traverse` | Traverse ecosystem packages in dependency order, executing visit procedure for each |
| `dag.visualizeDAG` | Visualize the DAG structure (for debugging) |

## docker

| Procedure | Description |
|-----------|-------------|
| `docker.build` | Build a Docker image |
| `docker.compose.build` | Build the images of the services of a compose project |
| `docker.compose.down` | Stop services with docker compose |
| `docker.compose.logs` | Get the logs of the services of a compose project (without follow) |
| `docker.compose.ps` | List the containers of a compose project |
| `docker.compose.restart` | Restart the services of a compose project |
| `docker.compose.up` | Start services with docker compose |
| `docker.exec` | Execute command in a running container |
| `docker.images` | List images |
| `docker.inspect` | Give the details of containers, images, volumes or networks: data has the JSON of docker |
| `docker.logs` | Get container logs |
| `docker.network.create` | Create a network. A name that exists is an error |
| `docker.network.list` | List networks |
| `docker.network.remove` | Remove networks |
| `docker.prune` | Remove unused containers, images, volumes, networks or build cache. It needs confirm: true |
| `docker.ps` | List containers |
| `docker.pull` | Pull a Docker image |
| `docker.push` | Push an image to a registry. The registry replaces an image with the same tag |
| `docker.rm` | Remove container(s) |
| `docker.run` | Run a Docker container |
| `docker.stop` | Stop running container(s) |
| `docker.tag` | Give an image another name. An image that had the name loses it |
| `docker.volume.create` | Create a volume. A volume that exists stays as it is |
| `docker.volume.list` | List volumes |
| `docker.volume.remove` | Remove volumes. Their data is lost |

## ecosystem

| Procedure | Description |
|-----------|-------------|
| `ecosystem.procedures` | List all procedures across the ecosystem |

## env

| Procedure | Description |
|-----------|-------------|
| `env.check` | Which required environment variables are missing |
| `env.get` | One environment variable. A secret is masked unless the host reveals it |
| `env.list` | The names of the environment variables, never the values of the secrets |

## exif

| Procedure | Description |
|-----------|-------------|
| `exif.read` | Read when and where a JPEG photo was taken (EXIF time and GPS position) |

## fs

| Procedure | Description |
|-----------|-------------|
| `fs.copy` | Copy file or directory. Without overwrite, it refuses an existing destination (EEXIST). |
| `fs.exists` | Check if file or directory exists |
| `fs.glob` | Find files matching glob pattern |
| `fs.hash` | The hash of a file |
| `fs.mkdir` | Create directory |
| `fs.move` | Move or rename file/directory |
| `fs.read` | Read file contents |
| `fs.read.json` | Read and parse JSON file |
| `fs.readdir` | Read directory contents |
| `fs.rm` | Remove file or directory |
| `fs.stat` | Get file or directory stats |
| `fs.temp` | Make a temporary folder |
| `fs.watch` | The changes of a file or folder, as a stream |
| `fs.write` | Write content to file |
| `fs.write.json` | Write a value as a JSON file, with a rename at the end |

## generators

| Procedure | Description |
|-----------|-------------|
| `generators.betaCdf` | This function gives the regularized incomplete beta function: the beta cumulative distribution at `x`. |
| `generators.canonicalHash` | This function gives the content hash of a value: `sha256Hex(canonicalJson(value, options))`. |
| `generators.canonicalJson` | This function gives the canonical form of a value. The default form is RFC 8785 (JCS): |
| `generators.coveringArray` | This function gives a covering array of strength `t` over dimensions with `levels[i]` levels each. Each row has the index of one level of each dimension. With fewer dimensions than `t`, the array covers each combination of all the dimensions. Thus no dimensions give one empty row, as the product of no sets has one item. |
| `generators.dependsOnLibm` | This function tells if the numbers of a family use `Math.exp`, `Math.log` or `Math.pow`. The result of those functions can change between JavaScript engines. Thus such a family has the same numbers only on one platform. |
| `generators.deriveSeed` | The seed of the stream with the name `label` under `seed`: the hash of `"<seed>:<label>"`. |
| `generators.familyPoints` | This function gives the points of the family at the points of a unit design. |
| `generators.fnv1a32` | The FNV-1a hash of 32 bits of a string. The option `input` selects the units that the hash reads: |
| `generators.latinHypercube` | This function gives a Latin hypercube of `n` points in `d` dimensions. Each column has exactly one point in each of the `n` strata `[k/n, (k+1)/n)`. For each column, the draws are one shuffle of the strata, then one draw in each point. |
| `generators.normalCdf` | This function gives the standard normal cumulative distribution, `P(Z <= x)`. Below 0.75 in size, `x` uses the series of `0.5 + phi(x) * (x + x^3/3 + x^5/15 + ...)`. The tails use the continued fraction of the Mills ratio, so a lower tail has no cancellation. On 2026-11-09 the error was at most 4.4 ulps from -38 to 9, against `mpmath`. `normalCdf(-37)` is approximately 5.7e-300, not 0. |
| `generators.normalQuantile` | This function gives the quantile of the standard normal law: the `x` with `normalCdf(x) = p`. It uses PPND16 of Wichura (algorithm AS 241). Below 0.075, one step of Halley with `normalCdf` follows. Above 0.5, `p` uses the lower tail at `1 - p`. This subtraction is exact. On 2026-11-09 the error was at most 1.2 ulps in the tails and 5.5 ulps from 0.075 to 0.925, against `mpmath`. |
| `generators.plackettLuceOrder` | A random order of a list with the Plackett-Luce law of the weights (the Gumbel-max method). Each item gets the sum of its log-weight and a Gumbel draw. The order goes from the largest sum to the smallest. |
| `generators.randomDesign` | This function gives `n` independent uniform points of the unit cube in `d` dimensions. The draws go row by row. |
| `generators.recordedSpec` | This function gives the spec of the family `recorded` that draws from a table. |
| `generators.saltelliDesign` | This function gives the Saltelli design for the Sobol indices of a model with `d` inputs: `a`, `b` and the `d` matrices `ab`. The design has `n * (d + 2)` points for the model. `a` comes from `r.fork("A")`, and `b` comes from `r.fork("B")`. With `base` `"latin"`, each is a Latin hypercube. |
| `generators.seedOf` | The 32-bit seed of a number (its low 32 bits, unsigned) or of a string (its FNV-1a hash). |
| `generators.seedsFrom` | The seeds of a run: the seeds in `given` (the text of an environment variable, for example `process.env.SEED`), else the default seeds. An empty text gives the defaults. |
| `generators.sha256Hex` | This function gives the SHA-256 digest of the bytes of a string, as 64 lowercase hex characters. The option `input` selects the bytes of a lone surrogate. It is not for passwords: it has no salt and no cost. |
| `generators.shrinkPoint` | This function shrinks a point of a family that fails. Each dimension moves toward `shrinkTarget`, while the point still fails. - In each round, each dimension first tries its target. Then a bisection on the scale of the dimension finds the edge of the failure. - The rounds continue until a round has no move, or until the budget of checks ends. - The function `fails` gives `true` for a point that fails. A first point that does not fail is a `RangeError`. - The shrink has no random draws. Thus the same point and the same function give the same result. |
| `generators.shrinkTarget` | This function gives the target of a dimension: the value of its range nearest to 0. |
| `generators.stablePick` | One item of a list, chosen by highest random weight: each key has a weight from `seed`, and the largest weight wins. |
| `generators.stratifiedDesign` | This function gives a stratified grid: `strata` strata on each axis, so `strata^d` cells, and one uniform point in each cell. The cells go in the order of their index in base `strata`, with the first dimension as the last digit. |
| `generators.tupleCoverage` | This function gives the coverage of some rows over named dimensions, with the strength `t` (the default is 2). A row holds a combination when it has each of its values. The function compares the values as text with `String`, and it ignores the fields of a row that are not dimensions. With fewer dimensions than `t`, the combinations are those of all the dimensions. Thus no dimensions give one empty combination, with the key `""`. |

## geo

| Procedure | Description |
|-----------|-------------|
| `geo.arcgisFeatures` | Give the features of an ArcGIS layer in a box as GeoJSON, for example the evacuation zones of an official map service |
| `geo.bboxCenter` | This function gives the middle of a box. Its latitude is the middle of the latitudes of the box. Its longitude is the middle of the arc of longitudes from the west to the east. For a box that crosses the antimeridian, the middle is on the arc across the antimeridian. |
| `geo.bboxContains` | This function gives `true` when the closed box has the point. A box that reaches a pole has the pole for each longitude. |
| `geo.bboxIntersects` | This function gives `true` when the two closed boxes have a common point. Two boxes that touch on an edge have a common point. Two boxes that reach the same pole have the pole. |
| `geo.bboxOfGeoJson` | This function gives the smallest bounding box of a GeoJSON object. It reads the coordinates, not the member `bbox`. |
| `geo.bboxOfPoints` | This function gives the smallest bounding box of the points. A box crosses the antimeridian when that makes it narrower. For an empty array, the result is `undefined`. |
| `geo.bufferKm` | This function gives the buffer of a GeoJSON geometry: the area within a distance in kilometres of the geometry, as a polygon for a map. The module documentation gives the rules and the guarantee of the tolerance. |
| `geo.bufferMeters` | This function gives the buffer of a GeoJSON geometry: the area within a distance in metres of the geometry, as a polygon for a map. It uses the rules of `bufferKm`. |
| `geo.centralAngleRadians` | This function gives the angle between two points at the center of the sphere, in radians from 0 to pi. It uses the haversine formula. The result is the same when the two points change places. |
| `geo.circleKm` | This function gives a circle on the Earth as a polygon. The radius is a great-circle distance in kilometres. The module documentation gives the rules for the antimeridian and the poles. |
| `geo.circleMeters` | This function gives a circle on the Earth as a polygon. The radius is a great-circle distance in metres. The module documentation gives the rules for the antimeridian and the poles. |
| `geo.decodeGeohash` | This function gives the cell of a geohash: its edges and its center. Upper case letters are correct. Each character must be an ASCII digit or an ASCII letter. |
| `geo.densify` | This function gives a copy of a geometry with more positions on its edges. It divides each edge into equal parts, so that no part is longer than `maxStep` degrees of longitude or of latitude. Use it before a drawing on a globe. |
| `geo.destinationKm` | This function gives the point at a distance from a start point, along the great circle with an initial bearing. The longitude of the result is normalized. A negative distance goes in the opposite direction. |
| `geo.destinationMeters` | This function gives the point at a distance in metres from a start point, along the great circle with an initial bearing. The longitude of the result is normalized. |
| `geo.distance` | Give the great-circle distance between two points in kilometres (haversine), without the network. Deprecated: use geo.distanceKm with radiusKm 6371 |
| `geo.distanceBetweenGeometriesKm` | This function gives the great-circle distance in kilometres between the nearest points of two GeoJSON geometries. The rules are in the description of this module. The model is a sphere. |
| `geo.distanceBetweenGeometriesMeters` | This function gives the great-circle distance in metres between the nearest points of two GeoJSON geometries. It uses the rules of `distanceBetweenGeometriesKm`. |
| `geo.distanceKm` | This function gives the great-circle distance between two points in kilometres. The model is a sphere. On the ellipsoid of WGS84, the true distance can be different by up to approximately 0.6 %. |
| `geo.distanceMeters` | This function gives the great-circle distance between two points in metres. The model is a sphere. |
| `geo.distanceToGeometryKm` | This function gives the great-circle distance in kilometres from a point to the nearest point of a GeoJSON geometry. The rules are in the description of this module. The model is a sphere. |
| `geo.distanceToGeometryMeters` | This function gives the great-circle distance in metres from a point to the nearest point of a GeoJSON geometry. It uses the rules of `distanceToGeometryKm`. |
| `geo.followsRightHandRule` | This function gives `true` when the polygon follows the right-hand rule of RFC 7946 (section 3.1.6): each exterior ring is counterclockwise, and each hole is clockwise. A degenerate ring does not follow the rule. |
| `geo.fromGeoJsonBBox` | This function reads a GeoJSON bounding box of 4 or 6 numbers, with the rules of `parseGeoJson`. It examines the altitudes, and then it ignores them. It gives a box with longitudes from -180 to 180, with no rounding: |
| `geo.fromPosition` | This function gives the point of a GeoJSON position. It ignores the altitude. The longitude of the result is normalized. |
| `geo.fromUnitVector` | This function gives the point in the direction of a vector from the center of a sphere. The vector can have each length other than 0. The longitude of the result is normalized. |
| `geo.geocode` | Find the coordinates of an address or a place name (OpenStreetMap Nominatim) |
| `geo.geodesicDirect` | This function gives the point at a distance along the geodesic from a start point with an initial bearing. It also gives the bearing of the geodesic at that point. |
| `geo.geodesicInverse` | This function gives the geodesic between two points on an ellipsoid: its length and its bearings at the two ends. The geodesic is the shortest path between the two points on the ellipsoid. |
| `geo.geohash` | Give the geohash of a point and the cell of that geohash, without the network |
| `geo.geohashesInBBox` | This function gives the geohashes of the cells that cover a closed box, with one precision. The list has each cell that has a point of the box one time, with the rule of `geohash` for a point on an edge. So a cell that touches the box only on the south edge or the west edge of the box is not in the list. A cell that touches the box only on the north edge or the east edge of the box is in the list. The order is from south to north, then from west to east. A box that crosses the antimeridian is correct. |
| `geo.geohashNeighbor` | This function gives the neighbor of a cell in a direction, with the same precision. The longitude wraps at the antimeridian. Past a pole, the result is `undefined`. |
| `geo.geohashNeighbors` | This function gives the eight neighbors of a cell. A neighbor past a pole is `undefined`. |
| `geo.initialBearing` | This function gives the initial bearing of the great circle from `from` to `to`, in degrees clockwise from north. The result is from 0 to less than 360. |
| `geo.intermediatePoint` | This function gives the point at a part of the way along the great circle from `from` to `to`. A part of 0 gives the start, 0.5 gives the middle, and 1 gives the end. The longitude of the result is normalized. |
| `geo.joinLines` | This function joins lines with a common end into longer lines, for example the ways of one street. Each input line goes into one result line, forward or reversed. |
| `geo.latLon` | This function gives a point with a normalized longitude. |
| `geo.locatePoint` | This function gives the location of a point against a Polygon or a MultiPolygon: `inside`, `boundary` or `outside`. The rules are in the description of this module. A point on the boundary of one part and inside another part is `inside`. A closed polygon contains the point when the result is not `outside`. |
| `geo.nearestOnLine` | This function gives the nearest point of a line to a point: the distance, the distance along the line, and the side. For many points on one line, use `lineReference`. Its rules apply. |
| `geo.normalizeLon` | This function gives the longitude in the range from -180 to less than 180. A longitude of 180 becomes -180, and -0 becomes 0. The result has no rounding: it is the longitude plus a multiple of 360. So the function does not change a longitude that is already in the range, other than -0. |
| `geo.osmFeatures` | Give the features of OpenStreetMap in a box as GeoJSON (the Overpass API), for example the shelters or the roads of a town |
| `geo.pointAlongLine` | This function gives the point at a distance along a line, moved by an offset to the left or to the right. For many points on one line, use `lineReference`. Its rules apply. |
| `geo.polygonIntersectsBBox` | This function gives `true` when a closed polygon and a closed box have a common point. A box that crosses the antimeridian is two rectangles, one on each side. |
| `geo.polygonsIntersect` | This function gives `true` when two closed polygons have a common point. Polygons that touch at one point intersect. A polygon in a hole of the other polygon does not intersect it, unless they touch. The rules are in the description of this module. The result is the same when `a` and `b` change places. |
| `geo.rewind` | This function gives a copy of the polygon that follows the right-hand rule of RFC 7946. It reverses each clockwise exterior ring and each counterclockwise hole. It does not change a degenerate ring. The copy keeps the other members of the object. |
| `geo.ringWinding` | This function gives the winding of a ring in the plane of longitude and latitude: the sign of its exact signed area. The sum uses exact dyadic numbers, so a rounding error cannot change the result. For a ring that crosses itself, the result is the sign of the sum of the signed areas of its loops. |
| `geo.route` | Give the time and the distance of a drive between two points (OSRM) |
| `geo.simplifyRegions` | This function simplifies regions that share borders, for example the counties of a state, with the method of Douglas and Peucker. It gives one region for each region of the input, with the same type. |
| `geo.soilAtPoint` | Give the soil at a point from USDA Soil Data Access (SSURGO): the major components of the map unit, with the septic rating, the slope, the drainage and the hydric rating |
| `geo.toGeoJsonBBox` | This function gives the GeoJSON form `[west, south, east, north]` of a box. |
| `geo.toPosition` | This function gives the GeoJSON position `[lon, lat]` of a point. |
| `geo.toUnitVector` | This function gives the unit vector of a point, from the center of a sphere to the point. A drawing in 3D multiplies the vector by its radius. |

## gh

| Procedure | Description |
|-----------|-------------|
| `gh.api` | Call the GitHub API and give the parsed JSON. A method other than GET can change or delete data |
| `gh.issue.comment` | Add a comment to an issue or a pull request |
| `gh.issue.create` | Open an issue |
| `gh.issue.list` | The issues of a repository |
| `gh.issue.view` | One issue, with its comments |
| `gh.pr.checks` | The checks of a pull request |
| `gh.pr.create` | Open a pull request |
| `gh.pr.list` | The pull requests of a repository |
| `gh.pr.view` | One pull request |
| `gh.release.list` | The releases of a repository |
| `gh.release.view` | One release: the release of a tag, or the latest release |
| `gh.run.download` | Download the artifacts of a workflow run into a folder |
| `gh.run.list` | The workflow runs of a repository |
| `gh.run.rerun` | Run a workflow run again |
| `gh.run.view` | One workflow run with its jobs |
| `gh.workflow.run` | Start a workflow run (a workflow_dispatch event) on a branch or a tag, with the inputs of the workflow |

## git

| Procedure | Description |
|-----------|-------------|
| `git.add` | Stage files |
| `git.blame` | Show the commit and the author of each line of a file |
| `git.branch` | Deprecated: use git.branch.list, git.branch.add or git.branch.delete. Branch operations |
| `git.branch.add` | Make a branch. An existing branch is an error |
| `git.branch.delete` | Delete a branch. With force, also a branch that is not merged |
| `git.branch.list` | List the branches, and give the current branch |
| `git.checkout` | Checkout branch or files |
| `git.clone` | Clone repository |
| `git.commit` | Create commit |
| `git.diff` | Show changes |
| `git.fetch` | Fetch from remote |
| `git.hasChanges` | Check if there are any changes (unstaged, staged, or untracked) |
| `git.hasLocalCommits` | Check if there are local commits that haven't been pushed |
| `git.hasStagedChanges` | Check if there are any staged changes ready to commit |
| `git.hasUnstagedChanges` | Check if there are any unstaged changes |
| `git.hasUntrackedFiles` | Check if there are any untracked files |
| `git.init` | Initialize a git repository |
| `git.isClean` | Check if the working directory is clean |
| `git.log` | Show commit log |
| `git.merge` | Merge a branch or a commit into the current branch. Conflicts give conflict: true |
| `git.merge.abort` | Stop a merge that has conflicts, and put back the state before it |
| `git.pull` | Pull from remote |
| `git.push` | Push to remote |
| `git.rebase` | Rebase the current branch on another branch (not interactive). Conflicts give conflict: true |
| `git.rebase.abort` | Stop a rebase, and go back to the branch as it was before the rebase |
| `git.rebase.continue` | Continue a rebase after the conflicts are resolved and staged |
| `git.remote` | Get the URL of a remote |
| `git.remote.set` | Set the URL of a remote, or add the remote |
| `git.reset` | Move HEAD to a commit, and reset the index (mixed) or also the working tree (hard) |
| `git.restore` | Restore files of the working tree or the index. The changes of the files are lost |
| `git.revParse` | Give the hash or the short name of a ref. An unknown ref is an error |
| `git.show` | Show a commit (its fields, files and diff), or a file at a commit |
| `git.stash.apply` | Apply stash without removing |
| `git.stash.drop` | Drop a stash |
| `git.stash.export` | Export stash as patch for snapshot storage |
| `git.stash.import` | Import stash from patch |
| `git.stash.list` | List all stashes |
| `git.stash.pop` | Pop stash (apply and remove) |
| `git.stash.push` | Push changes to stash |
| `git.status` | Get git status |
| `git.tag.add` | Make a tag. With a message, the tag is annotated. An existing tag is an error |
| `git.tag.delete` | Delete a tag |
| `git.tag.list` | List the tags, with their commits |
| `git.worktree.add` | Add a working tree in a new folder |
| `git.worktree.list` | List the working trees of the repository |
| `git.worktree.remove` | Remove a working tree and its folder |

## handle

| Procedure | Description |
|-----------|-------------|
| `handle.close` | Close a handle of the caller and its object, for example a database |
| `handle.list` | The open handles of the caller: the objects with a state that its procedures opened |

## http

| Procedure | Description |
|-----------|-------------|
| `http.json` | Send a GET or a POST of JSON and give the parsed JSON response |
| `http.ndjson` | Read an NDJSON response to a GET or a POST as a stream of parsed lines |
| `http.request` | Send an HTTP request and give the status, the headers and the body |
| `http.sse` | Read the server-sent events of a GET or a POST as a stream |

## ics

| Procedure | Description |
|-----------|-------------|
| `ics.fetch` | Get a calendar feed and read its events |
| `ics.occurrences` | Give the occurrences of the events of an iCalendar text in a time window, recurrences included |
| `ics.parse` | Read the events of an iCalendar text |
| `ics.write` | Write an iCalendar text from events: escaped text, folded lines and CRLF line ends |

## iosBackup

| Procedure | Description |
|-----------|-------------|
| `iosBackup.file` | Find a file of an iPhone backup by its domain and relative path in Manifest.db |
| `iosBackup.find` | Find the iPhone backups (MobileSync) on this computer, the newest first |
| `iosBackup.messages` | Read the messages (iMessage and SMS) of an iPhone backup, in time order |

## json

| Procedure | Description |
|-----------|-------------|
| `json.diff` | Give the RFC 6902 JSON Patch that changes one JSON value into another |
| `json.merge` | Apply an RFC 7386 JSON merge patch to a JSON value |
| `json.patch` | Apply an RFC 6902 JSON Patch to a JSON value |
| `json.query` | Find the values at a JSON Pointer or a path in a JSON value |
| `json.validate` | Examine a JSON value against a JSON Schema |

## lib

| Procedure | Description |
|-----------|-------------|
| `lib.audit` | Audit ecosystem packages for issues |
| `lib.graph` | The dependency graph of the workspace packages: nodes, workspace: edges, cycles and build levels |
| `lib.importCycles` | The import cycles of a tree of TypeScript sources: the cycles at runtime (after the import elision), of the declared imports, or of each import |
| `lib.new` | Create a new package in the ecosystem |
| `lib.rename` | Rename a package across the ecosystem |
| `lib.scan` | Scan for packages in the git directory |

## llm

| Procedure | Description |
|-----------|-------------|
| `llm.complete` | Send a prompt to a language model and give the text and the usage. The model can use tools and procedures |
| `llm.stream` | Send a prompt to a language model and stream the events of the answer. The model can use tools and procedures |
| `llm.structured` | Send a prompt and a JSON Schema to a language model and give a value that the schema accepts |

## logs

| Procedure | Description |
|-----------|-------------|
| `logs.query` | Query log entries from the database |
| `logs.store` | Store a log entry in the database |

## mail

| Procedure | Description |
|-----------|-------------|
| `mail.headers` | Give the headers of the recent messages of an IMAP mailbox, read only (no message becomes read) |
| `mail.parse` | Read the headers, the addresses and the text of a raw email message |

## manifest

| Procedure | Description |
|-----------|-------------|
| `manifest.generate` | Generate procedure manifests in various formats |

## mcp

| Procedure | Description |
|-----------|-------------|
| `mcp.list-tools` | List available MCP tools from the procedure registry |
| `mcp.serve` | Start MCP server to expose procedures as tools |

## mongo

| Procedure | Description |
|-----------|-------------|
| `mongo.collections.create` | Create a new collection |
| `mongo.collections.drop` | Drop (delete) a collection |
| `mongo.collections.list` | List all collections in the database |
| `mongo.collections.stats` | Get collection statistics |
| `mongo.database.info` | Get database information and statistics |
| `mongo.database.ping` | Health check and connectivity test |
| `mongo.documents.aggregate` | Run an aggregation pipeline (read only: $out and $merge are refused) |
| `mongo.documents.bulk` | Several writes in one request: insertOne, updateOne, updateMany, deleteOne and deleteMany, in order by default |
| `mongo.documents.count` | Count documents matching a filter |
| `mongo.documents.delete` | Delete documents matching a filter |
| `mongo.documents.distinct` | The distinct values of a field in the documents that match a filter |
| `mongo.documents.explain` | The plan of a find or an aggregation pipeline (read only: $out and $merge are refused) |
| `mongo.documents.find` | Find documents with pagination and filtering |
| `mongo.documents.get` | Get a single document by ID |
| `mongo.documents.insert` | Insert one or more documents |
| `mongo.documents.update` | Update documents matching a filter |
| `mongo.indexes.create` | Create an index on a collection |
| `mongo.indexes.drop` | Drop an index from a collection |
| `mongo.indexes.list` | List indexes on a collection |
| `mongo.watch` | The changes of a collection or a database, as a stream without an end (a change stream needs a replica set) |

## node

| Procedure | Description |
|-----------|-------------|
| `node.kill` | Kill a spawned Node.js process |
| `node.logs` | The output of a process of node.spawn: the last 64 KiB of stdout and stderr, or with follow a stream of its lines |
| `node.run` | Run a Node.js script and wait for completion |
| `node.spawn` | Spawn a long-running Node.js process |
| `node.status` | Get status of running Node.js processes |

## notify

| Procedure | Description |
|-----------|-------------|
| `notify.pushover.cancel` | Stop the repeats of a Pushover emergency message, by its receipt or by a tag |
| `notify.pushover.limits` | Read the monthly message limit of the Pushover application, the messages left and the reset time |
| `notify.pushover.receipt` | Read the receipt of a Pushover emergency message: acknowledged, by which device, expired. Read it at most once in 5 s. |
| `notify.pushover.send` | Send a Pushover message. Priority 2 repeats until the user acknowledges it, and gives a receipt. |
| `notify.pushover.validate` | Examine a Pushover user key: its active devices and licenses. It sends no message. |
| `notify.send` | Send a push notification through ntfy |

## npm

| Procedure | Description |
|-----------|-------------|
| `npm.deprecate` | Deprecate versions of a package in the registry. An empty message removes it. It needs confirm: true |
| `npm.distTags.add` | Set a dist-tag of a package to a version, in the registry. It needs confirm: true |
| `npm.distTags.list` | List the dist-tags of a package: tags has each tag and its version |
| `npm.distTags.remove` | Remove a dist-tag of a package, in the registry. It needs confirm: true |
| `npm.pack` | List the files of the tarball of the package (a dry run), or with dryRun: false make the tarball |
| `npm.view` | Read the fields of a package of the npm registry: data has the JSON of npm view |
| `npm.whoami` | Give the user name of the npm registry |

## ocr

| Procedure | Description |
|-----------|-------------|
| `ocr.image` | Read the text of an image with a local OCR engine (tesseract), with the confidence and the box of each line and word |
| `ocr.page` | Give the text of a PDF page with the box of each line and word: the text layer first, then OCR for a page with no text layer |

## optional

| Procedure | Description |
|-----------|-------------|
| `optional.err` | This function wraps the error of a step that failed. |
| `optional.flatMap` | This function applies `f`, which gives an optional, to a present value. An absent value stays absent. |
| `optional.flatMapResult` | This function applies `f`, which gives a result, to a value. An error stays the same. |
| `optional.fromNullable` | This function wraps a value, and gives `none` for `null` and `undefined`. |
| `optional.fromOptional` | This function changes an optional into a result: a present value becomes `ok`, and `none` becomes `err(error)`. |
| `optional.fromSentinel` | This function changes a value of the sentinel form into an optional. In the sentinel form, the value `sentinel` means "absent", for example a symbol `NotFound`. |
| `optional.getOkOr` | This function gives the value, or `fallback` for an error. |
| `optional.getOr` | This function gives the present value, or `fallback`. |
| `optional.isErr` | This function tells if a result is an error. |
| `optional.isNone` | This function tells if an optional is absent. |
| `optional.isOk` | This function tells if a result is a value. |
| `optional.isSome` | This function tells if an optional is present. |
| `optional.map` | This function applies `f` to a present value. An absent value stays absent. |
| `optional.mapErr` | This function applies `f` to an error. A value stays the same. |
| `optional.mapResult` | This function applies `f` to a value. An error stays the same. |
| `optional.ok` | This function wraps a value of a step that succeeded. |
| `optional.some` | This function wraps a present value. |
| `optional.toOptional` | This function changes a result into an optional: a value becomes `some`, and an error becomes `none`. |
| `optional.toSentinel` | This function changes an optional into the sentinel form: an absent value becomes `sentinel`. |
| `optional.unwrap` | This function gives the present value, or `undefined`. |

## pdf

| Procedure | Description |
|-----------|-------------|
| `pdf.render` | Render HTML to a PDF file with a headless Chromium browser |

## pnpm

| Procedure | Description |
|-----------|-------------|
| `pnpm.add` | Add packages using pnpm |
| `pnpm.exec` | Run a program of the dependencies (node_modules/.bin) with pnpm exec |
| `pnpm.install` | Install packages using pnpm |
| `pnpm.link` | Link packages using pnpm |
| `pnpm.list` | List the installed packages: data is the JSON of pnpm list --json |
| `pnpm.outdated` | List the outdated packages: data is the JSON of pnpm outdated |
| `pnpm.pack` | Make a tarball of the package: data gives its file name and files |
| `pnpm.remove` | Remove packages using pnpm |
| `pnpm.run` | Run package scripts using pnpm |
| `pnpm.store.path` | Get pnpm store path for snapshot/restore |
| `pnpm.update` | Update packages to their newest versions in the ranges, or with latest to the latest versions |
| `pnpm.why` | Show the packages that depend on a package: data is the JSON of pnpm why --json |

## predicates

| Procedure | Description |
|-----------|-------------|
| `predicates.classifySegments` | This function gives the exact relation of the closed segments `ab` and `cd`. The inputs must be finite. |
| `predicates.classifySegmentsShifted` | This function gives the exact relation of the closed segment `ab` and the closed segment `cd` after its move by `t`. The rule is the rule of `classifySegments` on the exact moved points. The inputs must be finite. |
| `predicates.compareShifted` | This function gives the exact sign of `x + t - y`. The inputs must be finite. |
| `predicates.incircle` | This function gives the exact in-circle sign of the point `d` against the circle through `a`, `b` and `c`, and the stage that decided it. The inputs must be finite. |
| `predicates.incircleExact` | This function gives the exact in-circle sign over dyadic numbers, with no filter. |
| `predicates.incircleSign` | This function gives the exact in-circle sign of `incircle` without the stage. It is the form for a hot loop. |
| `predicates.locateInRings` | This function gives the exact location of the point `(x, y)` against the rings moved by `t = (tx, ty)`. The result has no error: it is the location against the exact moved rings, also when a float sum of a position and `t` rounds. |
| `predicates.orient2d` | This function gives the exact orientation sign of the points `a`, `b` and `c`, and the stage that decided it. The inputs must be finite. |
| `predicates.orient2dExact` | This function gives the exact orientation sign over dyadic numbers, with no filter. Each finite float is a dyadic number, so the differences and the products are exact. |
| `predicates.orient2dShifted` | This function gives the exact orientation sign of the points `a`, `b` and `c + t`, and the stage that decided it. The inputs must be finite. The sign does not change when `a` and `b` move by `-t` in place of `c` by `t`. |
| `predicates.orient2dShiftedSign` | This function gives the exact sign of `orient2dShifted` without the stage. It is the form for a hot loop. |
| `predicates.orient2dSign` | This function gives the exact orientation sign of `orient2d` without the stage. It is the form for a hot loop. |
| `predicates.rayEdge` | This function gives the exact test of the edge from `a` to `b`, moved by `t = (tx, ty)`, and the ray from `(x, y)` to the east. The result has no error, also when a float sum of a position and `t` rounds. |

## privacyScan

| Procedure | Description |
|-----------|-------------|
| `privacyScan.files` | Find private data in files and folders: terms of a list, email addresses, phone numbers, coordinates |
| `privacyScan.text` | Find private data in a text: terms of a list, email addresses, phone numbers, coordinates |

## procedure

| Procedure | Description |
|-----------|-------------|
| `procedure.define` | Define a new procedure from an aggregation |
| `procedure.delete` | Delete a runtime-defined procedure |
| `procedure.export` | Export a procedure definition as JSON |
| `procedure.get` | Describe a procedure by path or key |
| `procedure.list` | List the registered procedures |
| `procedure.load` | Define the stored programs again (procedure.define), after a restart |
| `procedure.manifest` | The manifest of the registry: each exposed procedure with its schemas and effects |
| `procedure.new` | Scaffold a new procedure with types and registration boilerplate |
| `procedure.register` | Register a procedure at runtime |
| `procedure.remote` | The status of the program store of the registry |
| `procedure.search` | Search the procedures by words: the best matches of the key, the tags and the description |
| `procedure.store` | Write the program of a procedure that procedure.define made to the program store |
| `procedure.sync` | Synchronize the runtime-defined procedures of the registry with the program store |

## program

| Procedure | Description |
|-----------|-------------|
| `program.check` | Check a program before it runs: names, procedures, inputs, the capability and the effects |
| `program.compile` | Compile a program to a JavaScript function that makes the same calls in the same order |
| `program.diagram` | Draw a program as a Mermaid flowchart: the order of the calls, the control flow and the names |
| `program.explain` | Explain a program before it runs: its effects, each call with the answer of the capability, and the problems |

## quantity

| Procedure | Description |
|-----------|-------------|
| `quantity.add` | This function gives a + b in the unit of a. It is exact for decimal inputs, thus money adds to the cent. |
| `quantity.canonicalUnit` | This function gives the canonical spelling of a unit, for data from another system: "hr" is "h". |
| `quantity.compare` | This function gives -1, 0 or 1. Infinity is larger than all amounts, and equal to itself. |
| `quantity.convert` | _(no description)_ |
| `quantity.convertExact` | This function converts a value in one unit, exactly, into another unit. |
| `quantity.convertible` | _(no description)_ |
| `quantity.format` | This function prints an amount: "$1,234.56", "$500/mo", "7,875 s", "34.5%", "72°F", "12 reps", "∞ s". |
| `quantity.formatDuration` | This function prints a time as people say it: "2 h 11 min 15 s", "45 min", "2 days 3 h". A time of less than a second keeps its own unit ("250 ms"). The `parts` option sets the most units that it names, and it rounds the smallest. It is `formatOnScale` with a compound of days, hours, minutes and seconds. |
| `quantity.formatOnScale` | This function prints an amount on a scale: "512 B", "1.5 KiB", "3.5 ms", "1.25 s", "2 min 5 s". It rounds the amount in a step before it compares the amount with the next step. Thus 1,048,575 B gives "1 MiB", not "1,024 KiB". |
| `quantity.formatUnit` | This function gives how a unit reads next to an amount: "kcal/(h·kg)", "sets/wk", "% of 1RM", "mph". |
| `quantity.isCanonicalUnit` | This function tells if stored data can have this spelling. Only the canonical spelling is correct. |
| `quantity.isQuantity` | This function tells if a value from data is a quantity: a finite number and a canonical unit. |
| `quantity.isUnbounded` | _(no description)_ |
| `quantity.kindOf` | _(no description)_ |
| `quantity.kindOfQuantity` | This function gives the kind that a quantity measures. |
| `quantity.lookupAtom` | This function gives the atom that a spelling names: its symbol or one of its aliases. |
| `quantity.max` | _(no description)_ |
| `quantity.mean` | This function gives the arithmetic mean. For a logarithmic level, it gives the energy mean: 10·log10 of the mean power. |
| `quantity.min` | _(no description)_ |
| `quantity.parseUnit` | This function resolves a unit from its spelling. The spelling has symbols or their aliases, factors joined by `·` or `*`, and one `/` at most. All that follows the slash divides: "kcal/h·kg" is per hour per kilogram. A factor can have a power (`m^2`) and say what it counts (`{rep}`). |
| `quantity.quantity` | This function makes a quantity, and checks that it has a finite value and a canonical unit. |
| `quantity.round` | This function rounds an amount to the decimals that its unit keeps (money to the cent), or to `decimals`. |
| `quantity.sameVector` | _(no description)_ |
| `quantity.scale` | This function multiplies an amount by a plain number: a count of probes, or a share. |
| `quantity.sub` | _(no description)_ |
| `quantity.sum` | This function gives the sum in `unit`, or in the unit of the first amount. An empty sum needs `unit`. |
| `quantity.toNanoseconds` | This function gives a time as a whole number of nanoseconds, or refuses it. A double holds each whole nanosecond for approximately 104 days. |
| `quantity.tryParseUnit` | This function gives the unit of a spelling, or undefined when the spelling names no unit. |
| `quantity.unbounded` | _(no description)_ |
| `quantity.valueIn` | This function gives the number that a quantity is in a unit. |
| `quantity.whyNotConvertible` | This function gives the reason that `from` cannot become `to`, or undefined when it can. |

## rational

| Procedure | Description |
|-----------|-------------|
| `rational.abs` | This function gives `\|a\|`. The result is exact. |
| `rational.add` | This function gives `a + b`. The result is exact. |
| `rational.ceil` | This function gives the least integer that is not less than the value. The result is exact. |
| `rational.cmp` | This function is `compare`, with the name that `@mark1russell7/quantity` uses. |
| `rational.compare` | This function gives -1, 0 or 1 for `a < b`, `a = b` or `a > b`. The result is exact. |
| `rational.div` | This function gives `a / b`. The result is exact. |
| `rational.equals` | This function tells if `a = b`. Each rational is in lowest terms, so the test compares the fields. |
| `rational.floor` | This function gives the greatest integer that is not more than the value. The result is exact. |
| `rational.fromDecimal` | This function reads a decimal from its text, exactly. The text `"0.0254"` gives 127/5000, and `"1e-9"` gives 1/10^9. |
| `rational.fromFloat` | This function gives the exact value of a finite double. Thus `0.1` gives 3602879701896397/2^55. The value `-0` gives 0. |
| `rational.fromNumber` | This function reads a finite number as JavaScript prints it. That text is the shortest decimal that reads back as the same number. Thus `0.1` gives 1/10, not the exact value of the double. Use `fromFloat` for the exact value. |
| `rational.gcd` | This function gives the greatest common divisor of `\|a\|` and `\|b\|`. The result for `0` and `0` is `0`. |
| `rational.integerRoot` | This function gives the floor of the `k`-th root of `n`: the largest integer `r` with `r^k <= n`. The result is exact. The search starts above the root, from the bit length of `n`, and the Newton steps go down to the root. |
| `rational.inverse` | This function gives `1 / a`. The result is exact. |
| `rational.isInteger` | This function tells if the value is an integer. |
| `rational.mul` | This function gives `a × b`. The result is exact. |
| `rational.neg` | This function gives `-a`. The result is exact. |
| `rational.pow` | This function gives `a` to an integer power. The result is exact. The power 0 of each value, 0 too, is 1. |
| `rational.rational` | This function makes the rational `n / d` in lowest terms. The result is exact. |
| `rational.root` | This function gives the `k`-th root of `a` when it is a rational, and `null` when it is not. The root of a rational in lowest terms is rational only when its numerator and its denominator are both `k`-th powers of integers. An odd index gives the negative root of a negative value. The result is exact. |
| `rational.sign` | This function gives -1, 0 or 1 for a value that is less than 0, equal to 0 or more than 0. |
| `rational.sub` | This function gives `a - b`. The result is exact. |
| `rational.toNumber` | This function gives the nearest double to the value, with ties to even. The error is at most half a unit in the last place. A value past the range of the doubles gives an infinity, and a value too small gives 0 or a subnormal. |
| `rational.toString` | This function gives the text `"n/d"`, or `"n"` for an integer. The text is exact. |

## restic

| Procedure | Description |
|-----------|-------------|
| `restic.run` | Run a restic command (backup, snapshots, restore, forget, check) |

## s3

| Procedure | Description |
|-----------|-------------|
| `s3.copy` | Copy an object inside S3 (it replaces the destination, unless overwrite is false) |
| `s3.delete` | Delete object from S3 bucket |
| `s3.download` | Download content from S3 bucket |
| `s3.head` | The metadata of an object, without its content (exists: false for a 404) |
| `s3.list` | List objects in S3 bucket |
| `s3.listAll` | List ALL objects in S3 bucket, following continuation tokens (unbounded by 1000) |
| `s3.multipart.abort` | Abort multipart upload and clean up parts |
| `s3.multipart.complete` | Complete multipart upload by assembling parts |
| `s3.multipart.init` | Initialize multipart upload for large files |
| `s3.multipart.upload` | Upload a part in multipart upload |
| `s3.presign` | A presigned URL for a GET or a PUT of an object, with an expiry in seconds |
| `s3.read` | Read an S3 object into memory, with a size limit (maxBytes, 64 MiB by default) |
| `s3.upload` | Upload content to S3 bucket |

## schedule

| Procedure | Description |
|-----------|-------------|
| `schedule.add` | Add a schedule: a cron expression that starts a stored program with an input |
| `schedule.list` | The schedules, with the next time and the last run of each |
| `schedule.next` | The next times of a cron expression |
| `schedule.remove` | Remove a schedule |

## sdk

| Procedure | Description |
|-----------|-------------|
| `sdk.openrpc` | Describe the exposed procedures as an OpenRPC 1.3 document |
| `sdk.typescript` | Write a typed TypeScript SDK for the exposed procedures |

## server

| Procedure | Description |
|-----------|-------------|
| `server.call` | Call a procedure on a remote peer through an outbound connection |
| `server.connect` | Connect to a remote peer for bidirectional RPC |
| `server.connections` | List outbound connections to remote peers |
| `server.create` | Create a transport-agnostic peer that exposes procedures |
| `server.disconnect` | Disconnect from a remote peer |
| `server.start` | Start CLI server as background daemon |
| `server.status` | Get CLI server status |
| `server.stop` | Stop running CLI server |

## shell

| Procedure | Description |
|-----------|-------------|
| `shell.exec` | Execute command string via shell |
| `shell.run` | Run a command with arguments |
| `shell.stream` | Run a command and stream each output line as it arrives |
| `shell.which` | Find the path to a command |

## snapshot

| Procedure | Description |
|-----------|-------------|
| `snapshot.create` | Create environment snapshot and upload to S3 |
| `snapshot.delete` | Delete a snapshot from S3 |
| `snapshot.diff` | Compare current state against a snapshot |
| `snapshot.list` | List available snapshots in S3 bucket |
| `snapshot.restore` | Restore environment from S3 snapshot |

## splay

| Procedure | Description |
|-----------|-------------|
| `splay.bridge.health` | Health check for client-splay bridge |
| `splay.bridge.info` | Get client-splay bridge information: its name and its version |

## sqlite

| Procedure | Description |
|-----------|-------------|
| `sqlite.addMissingColumns` | This function adds each column that a table does not have, and gives the names of the added columns in their order. |
| `sqlite.backup` | Copy a database to a new file (it does not replace a file) |
| `sqlite.checkIntegrity` | This function does the integrity check of SQLite on a connection. A file that is not a database gives a problem, not an error. A different error, for example a lock that is not free, goes to the caller. |
| `sqlite.checkpoint` | This function does a checkpoint of the write-ahead log, and gives its result. |
| `sqlite.clearDatabase` | This function drops each view and each table of the database, and sets `user_version` to 0. The indexes and the triggers go with their tables and views. The tables of SQLite itself (`sqlite_*`) stay. Then `migrate` makes each step again. |
| `sqlite.execute` | Execute a SQL statement (INSERT, UPDATE, DELETE) |
| `sqlite.migrate` | Apply the numbered migrations (a folder or a list) that a database does not have, in one transaction |
| `sqlite.openDatabase` | This function opens a database, and makes the file when it is not there. `:memory:` gives a database with no file. With `readOnly`, the file must exist. |
| `sqlite.query` | Execute a SQL SELECT query (read only: a statement that changes data fails) |
| `sqlite.schema` | The columns, indexes and foreign keys of a table (read only) |
| `sqlite.schemaVersion` | This function gives the schema version of a database. Without a part, it is the `user_version` of the file. With a part, it is the version of that part in the table `schema_versions`, and 0 when the file does not have the part. |
| `sqlite.snapshot` | This function writes a copy of an open database to a file with `VACUUM INTO`. The copy is one consistent state, and writers can continue during the copy. The function writes a temporary file first, and then it replaces the file at the path. Thus a reader of the path sees the old copy or the new copy. |
| `sqlite.tableColumns` | This function gives the names of the columns of a table, in the order of the table. A table that does not exist gives an empty list. |
| `sqlite.tables` | The tables and views of a database (read only: a missing file is an error) |
| `sqlite.transaction` | Run statements in one transaction: they all take effect, or none does |
| `sqlite.userVersion` | This function gives the pragma `user_version` of a database. |

## statistics

| Procedure | Description |
|-----------|-------------|
| `statistics.addToRunning` | This function gives the summary with one more value. It throws a RangeError for NaN, as the functions of a list do. The mean of each step is `sum / n`, so the mean of the fold is the mean of the list. |
| `statistics.bestSmoothLaw` | This function gives the smooth law with the highest likelihood. Under 300 values the result is not reliable: the normal and the log-normal law lose to the laws with a fitted end. The README gives the measured shares of correct results. The function throws as `smoothLawScores` does. |
| `statistics.binomialInterval` | The central interval of a count X ~ Binomial(n, p). `low` is the smallest k with P(X <= k) > (1 - level) / 2. `high` is the largest k with P(X >= k) > (1 - level) / 2. Each tail outside the interval holds (1 - level) / 2 or less. The two tails are separate sums, so that a small upper tail keeps its digits. |
| `statistics.binomialTest` | This function gives the p of the exact one-sided binomial test of `k` successes in `n` trials, with X ~ Binomial(n, p). The side `"less"` gives `P(X <= k)`. A small value rejects the claim "the chance is `p` or more". The side `"greater"` gives `P(X >= k)`. A small value rejects the claim "the chance is `p` or less". |
| `statistics.bootstrap` | A percentile bootstrap interval of `statistic` over `data`. A run whose statistic is not finite (NaN or an infinity) does not count. When no run is finite, low and high are equal to the estimate. |
| `statistics.bootstrapClusters` | A cluster bootstrap: each run draws whole clusters with replacement, and the statistic reads the rows of the drawn clusters. Use it when the rows of one cluster (one board, one seed, one site) are not independent. The clusters are in the order of their first row. |
| `statistics.bootstrapLeastSquares` | A percentile bootstrap interval of each coefficient of the least-squares fit of `y` on the rows of `x`. Each run draws `n` row indexes with replacement, and fits the drawn rows and their `y` values. All the intervals come from the same draws. The estimate of each interval is the coefficient of the fit of all the data. A run with a singular design gives NaN coefficients, so it does not count. The shape errors are the errors of `leastSquares`. |
| `statistics.bootstrapMedian` | A bootstrap interval of the median. |
| `statistics.bootstrapMedianRatio` | A bootstrap interval of the ratio `median(numerator) / median(denominator)` of two independent samples. The interval is the uncertainty of the ratio of the two medians. It is not the spread of the samples. A run whose denominator median is 0 is not finite, so it does not count. |
| `statistics.bootstrapStrata` | A stratified bootstrap: each run draws, inside each stratum, as many items as the stratum has, with replacement. So each sample keeps the size of each stratum. Use it when the strata are fixed by the design, for example the families of the inputs of a benchmark. The draws of one run go through the strata in the order of the list. With one stratum, the draws are equal to the draws of `bootstrap` with the same seed. The estimate is the statistic of all the strata. A run whose statistic is not finite does not count. |
| `statistics.bootstrapTwo` | A percentile bootstrap interval of `statistic` over two independent samples `a` and `b`. Use it when the two samples are not paired, for example two arms of a benchmark. Each run draws `a.length` items of `a` with replacement, and then `b.length` items of `b` with replacement. All the draws come from one stream of `random(seed)`. The statistic reads the two drawn samples. The estimate is the statistic of all of `a` and `b`. A run whose statistic is not finite does not count. When no run is finite, low and high are equal to the estimate. |
| `statistics.bradleyTerry` | The Bradley-Terry fit of `comparisons` among `items` items. The function does not sort or change its inputs. An empty list of comparisons gives the prior for each item. The function throws a RangeError for a bad index, a bad outcome, a bad weight and a bad option. |
| `statistics.bradleyTerrySparse` | The sparse Bradley-Terry fit of `comparisons` among `items` items. It has the model, the options and the checks of `bradleyTerry`, and its memory is in proportion to `items` plus the distinct pairs. The function does not sort or change its inputs. It throws a RangeError for a bad index, a bad outcome, a bad weight and a bad option. |
| `statistics.brier` | The Brier score: the mean of (p - outcome)^2. 0 is perfect, and 0.25 is a constant 0.5. Lower is better. |
| `statistics.calibration` | The hit rate of each stated level, from the lowest level. |
| `statistics.choosePair` | The choice of the next pair of a duel from a pool of rated items. The pool goes in the order of the ratings, from the highest. These are the steps: |
| `statistics.cohenKappa` | Cohen's kappa of two raters (Cohen, 1960). Item `i` has the category `a[i]` from one rater and `b[i]` from the other. Two categories are the same when they are `===`. A kappa of 1 is full agreement, and 0 is the agreement of chance. |
| `statistics.compareRatios` | The comparison of a candidate with a baseline, from the ratio candidate / baseline of each input. It answers the three questions of a promotion. How often is the candidate better? By how much? How often is it worse beyond the noise? A promotion reads `gains` against `drops` and `effect`, not `signP` alone, because a sign test counts a win of any size. |
| `statistics.coverageMinSample` | This function applies a fixed bar of coverage to the cells of a study. It gives the smallest sample size `m` from which an interval method keeps its level. The method qualifies at `m` when the cells with a sample of `m` or more pass two tests: |
| `statistics.eloExpected` | The expected score of the first item against the second item: `1 / (1 + base ** ((rb - ra) / scale))`. A win counts 1, a tie 0.5 and a loss 0. The expected score of the second item is 1 minus this value. |
| `statistics.eloReplay` | The Elo ratings of `items` items after each pick of `comparisons`, in the order of the list. Each item starts at `start`. The update of each pick is `eloUpdate` with the options. The order of the picks changes the result. |
| `statistics.eloUpdate` | The Elo update of a pair after one result. The `score` is the score of the first item: 1 for a win, 0.5 for a tie and 0 for a loss. Each rating moves by `k` times the difference between the score and the expected score. Thus the sum of the two ratings does not change. |
| `statistics.fitRatings` | The log-strengths of `items` items with one rating model. The model `"bradley-terry"` uses `bradleyTerry`, or `bradleyTerrySparse` above `denseLimit` items. The models `"elo"` and `"glicko2"` use `eloReplay` and `glicko2Replay`, and they refuse a weight other than 1. A log of 0 items gives empty lists. |
| `statistics.fitResponse` | This function fits each measure of `data`, and it gives a record with the models and the folds. |
| `statistics.glicko2Idle` | The Glicko-2 rating of a player after a rating period with no games. The rating and the volatility stay the same. The RD grows to `sqrt(RD^2 + (173.7178 * volatility)^2)`. |
| `statistics.glicko2Replay` | The Glicko-2 ratings of `items` items after each pick of `comparisons`, in the order of the list. Each pick is one rating period of its two items. Each item of a pick gets `glicko2Update` against the rating of the other item before the pick. An item that is not in a pick does not change in that period. The order of the picks changes the result. |
| `statistics.glicko2Update` | The Glicko-2 update of one player after one rating period (Glickman, "Example of the Glicko-2 system", 2012). The function uses the Illinois algorithm for the new volatility. The games use the ratings of the opponents from the start of the period. An empty list of games gives `glicko2Idle(player)`. |
| `statistics.heldOutError` | This function gives the held-out error of a measure over all the folds. Each point has the same weight, so a small fold has a small effect. The function throws a RangeError when no fold has the measure. |
| `statistics.heldOutErrorAt` | This function gives the held-out error of a chosen set of points, on the scale of the model. It uses the stored predictions of the option `outOfFold`. Thus a reader can get the error of one cell. The result has the fields of `heldOutError`, and the set of all the points gives the same values to the rounding of the sums. |
| `statistics.holm` | The Holm step-down correction of a family of tests (Holm, 1979). It keeps the chance of one false claim or more in the family at most `level`. It has no condition on how the tests depend on each other. The result is in the order of the input. |
| `statistics.kendallTau` | The Kendall tau-b of two lists (Kendall, 1938). The value is from -1 to 1. A pair with a tie in both lists does not count. When the lists have fewer than 2 values, or no pair counts, the value is 1. Above `KENDALL_EXACT` values, a seeded sample of 200 000 pairs gives an estimate. It is equal to the copy in highways. |
| `statistics.leastSquares` | The ordinary least-squares fit of `y` on the rows of `x`, with `k` coefficients. Each row has the same number of predictors. The fit solves the problem with a Householder QR decomposition. When the design does not have full rank, or when `n <= k`, the coefficients, `residualSd` and `r2` are NaN. When the total sum of squares is 0, `r2` is NaN. |
| `statistics.logLoss` | The log-loss of predictions: the mean of `-ln(p)` for a hit and `-ln(1 - p)` for a miss. 0 is perfect, and `ln(2)` is a constant 0.5. Lower is better. A p of 0 for a hit gives Infinity. For an outcome of three values, give the probability of the observed outcome as `p`, with `hit` true. |
| `statistics.mean` | _(no description)_ |
| `statistics.median` | The median: the middle value, or the midpoint `(a + b) / 2` of the two middle values. The midpoint is correctly rounded. `quantile(values, 0.5)` computes `a + 0.5 * (b - a)`, which can differ from it in the last bit. |
| `statistics.medianInterval` | The distribution-free interval of the median of a sample. It needs no assumption about the shape of the distribution. It is x_(k) to x_(n + 1 - k), for the largest k whose two tails each hold (1 - level) / 2 or less. For 11 values at the level 0.95, it is x_(2) to x_(10), with the coverage 0.988. |
| `statistics.mergeRunning` | This function gives the summary of the values of two summaries (Chan, Golub and LeVeque, 1979). Thus parallel jobs can each summarize a part. The sum of the merge adds the two sums, so it can differ from the fold in the last bits. |
| `statistics.modeCount` | This function counts the modes of a sample. A mode counts when it holds `minShare` of the mass. The default counts the modes that hold 10 percent, and a caller who needs all modes passes a smaller value. The result is at least 1. The result is the same for `x` and `-x`. |
| `statistics.negativeBinomialInterval` | The central interval of a negative binomial count. X is the count of failures before `successes` successes, and `p` is the chance of a success at each try. `low` is the smallest k with P(X <= k) > (1 - level) / 2. `high` is the smallest k with P(X <= k) >= 1 - (1 - level) / 2. |
| `statistics.noiseFloor` | The noise floor of a measure: k sample standard deviations of its value over independent seeds or folds. When the margin of practical effect is larger, the floor is the margin. A difference smaller than the floor is not a result. |
| `statistics.noiseVerdict` | The noise rule of a difference (candidate minus baseline) over independent seeds or folds: the mean against max(k standard deviations, margin). With `better: "lower"`, a negative mean is the gain. When each value is equal, the state is "no-spread" and not a result, also when the mean is beyond the margin. Find out why the seeds do not change the value before you read the difference. |
| `statistics.normalCdf` | This function gives the standard normal cumulative distribution, `P(Z <= x)`. Below 0.75 in size, `x` uses the series of `0.5 + phi(x) * (x + x^3/3 + x^5/15 + ...)`. The tails use the continued fraction of the Mills ratio, so a lower tail has no cancellation. On 2026-11-09 the error was at most 4.4 ulps from -38 to 9, against `mpmath`. `normalCdf(-37)` is approximately 5.7e-300, not 0. |
| `statistics.normalQuantile` | This function gives the quantile of the standard normal law: the `x` with `normalCdf(x) = p`. It uses PPND16 of Wichura (algorithm AS 241). Below 0.075, one step of Halley with `normalCdf` follows. Above 0.5, `p` uses the lower tail at `1 - p`. This subtraction is exact. On 2026-11-09 the error was at most 1.2 ulps in the tails and 5.5 ulps from 0.075 to 0.925, against `mpmath`. |
| `statistics.optionFloor` | This function gives the smallest count of values for each of two options. With it, one test finds a difference of `delta` with the stated power. The form is `n = 2 ((t(1 - alpha / (2 tests), df) + t(power, df)) sigma / delta)^2`, with `df = 2 n - 2`. The count is on both sides of that form, so the function takes the first count that meets it. |
| `statistics.pairedPermutation` | The paired permutation test (a random sign flip of each difference). It needs no normal distribution and uses the size of each difference, which the sign test does not. A pair with a difference of 0 adds nothing. |
| `statistics.pairInformation` | The expected information of a pick between two items: `p * (1 - p) * (ua^2 + ub^2)`. Here `p` is `eloExpected` of the two ratings, and `ua` and `ub` are the uncertainties. The value is high when the result is not sure (a `p` near 0.5) and the two ratings are not sure. |
| `statistics.pairProbabilities` | The probabilities of a pair under the Bradley-Terry model with Davidson (1970) ties. The inputs are the log-strengths of the two items and the tie parameter `tie` of `bradleyTerry`. With `tie` 0, the probability that the first item wins is `1 / (1 + exp(sb - sa))`. A constant added to the two strengths changes no probability. |
| `statistics.parseResponseRecord` | This function examines unknown data, for example the result of `JSON.parse`, against `response-records/1`. It gives `{ ok: true, record }`, with the same object as the record, or `{ ok: false, faults }`. Each fault has the path of the bad field and a message. The function does not throw. Data that the checks cannot read, for example an object with a loop, gives one fault. |
| `statistics.partialConjunction` | The p of the claim "at least `need` of these tests have a real effect" (Benjamini and Heller, 2008). The value is `(m - need + 1)` times the `need`-th smallest p, at most 1. It has no condition on how the tests depend on each other. With 2 tests and `need` 2, the value is the larger p. |
| `statistics.predictResponse` | This function gives the value of a model at `inputs`, on the scale of the measure. The inputs have a value for each dimension that the model reads. An absent conditional dimension has `null`. A table model gives its `fallback` for a combination with no cell. |
| `statistics.quantile` | The `p` quantile of a list. |
| `statistics.quantileInterval` | This function gives the distribution-free interval of the quantile `p` of a sample. Each tail outside the interval holds (1 - level) / 2 or less. Let X ~ Binomial(n, p). The lower rank is the largest l with P(X <= l - 1) in the tail. The upper rank is the smallest u with P(X >= u) in the tail. The values must be independent draws, or the coverage is false. |
| `statistics.quantileSamples` | This function gives the fewest independent values that give the quantile `p` an upper bound at `level`: the smallest n with p^n <= (1 - level) / 2. With that n, the upper bound is the largest value. At the level 0.95, p95 needs 72 values, p99 needs 368 values and p99.9 needs 3,688 values. |
| `statistics.quantileSorted` | The `p` quantile of a list that is already sorted. Use it when you take several quantiles of one list. The linear method gives the same numbers as the copies in highways, packing and layout-contract. The nearest-rank method gives the same numbers as the copies in lag, lag-hud and the backtest of highways. The higher method gives the upper median of the copies in highways with `p = 0.5`. |
| `statistics.ranks` | The ranks of the values, from 1. Equal values get the mean of their ranks. |
| `statistics.ratingToStrength` | The log-strength of a rating. It is the inverse of `strengthToRating` with the same options. |
| `statistics.ratingUncertainty` | The uncertainty of a rating, in rating points: its standard error, or `RATING_START_UNCERTAINTY / sqrt(1 + picks)`. |
| `statistics.responseCells` | This function gives the number of fitted places of a view before the view starts: the product of the lengths of its axes. A level axis counts its levels, and a continuous axis counts `steps`. The field `nearest` reads each point at each place, so the reads of a view are this count times the number of points. The default of `steps` is the default of a view. The function throws a RangeError for an unknown dimension, for one dimension named two times, and for a bad `steps`. |
| `statistics.ridgeSolve` | This function gives the coefficients `beta` that solve `(gram + lambda * P) beta = moment`. - `gram` is the symmetric matrix `X'X` of size `k`, in row order. The function reads only its lower triangle. - `moment` is the vector `X'y` of length `k`. - With `lambda` 0, the result is the ordinary least-squares fit. |
| `statistics.runningMean` | This function gives the mean of the values: `sum / n`. It throws a RangeError for the empty summary. |
| `statistics.runningOf` | This function gives the summary of the values of a list or another iterable, in their order. |
| `statistics.runningSd` | This function gives the sample standard deviation of the values (the divisor is n - 1). It needs 2 values or more. Equal values give exactly 0, as `sd` gives. A rounding error cannot make the result NaN. |
| `statistics.sampleTotalInterval` | A bootstrap interval of the total of a population from a uniform sample of `m` of its `n` items, drawn without replacement. The estimate is `scale * sum(values)`. Each run draws `m` values with replacement, as `bootstrap` does. The deviation of each run from the sum of the sample gets the factor `scale * sqrt(1 - m / n)`, the finite population correction. When `m` is `n`, the interval is the estimate. |
| `statistics.sd` | The sample standard deviation (the divisor is n - 1). It needs 2 values or more. Equal values give exactly 0. The rounding of the mean gives a small number that is not 0 for some equal values, so the function examines them first. |
| `statistics.selectRatingModel` | The choice of a rating model by the log-loss on held-out picks. Each model learns from the first picks of the log and forecasts the last `holdout` part. All models use the tie parameter of the Bradley-Terry fit of the first picks. Thus the strengths are the only difference. Two equal scores keep the order of `models`. Each pick has the weight 1. |
| `statistics.signFlipTest` | The sign-flip test of a sum of terms. Under the null, each term has the sign + or - with equal chance. The statistic is the absolute value of the sum. A weighted mean of paired differences is such a sum: give the terms `w[i] * d[i]`. |
| `statistics.signTest` | The sign test of paired results: `better` inputs where the candidate wins and `worse` where it loses. The ties do not count. One-sided (the default), it is the p of `better` wins or more if the two are equal. Two-sided, it is two times the tail of the larger count, at most 1. The one-sided p is equal to `signTestP` of packing. |
| `statistics.signTestPower` | The smallest number of wins out of `n` that the sign test calls significant at `level`. It is undefined when even n wins out of n are not enough. Use it before a run, to know how many inputs a claim needs. |
| `statistics.sliceResponse` | This function gives a view of a measure over one dimension of a parsed record: - `curve`: the fitted value at each level, or at `steps` values of a continuous dimension, with its band. - `points`: the measured points that match the held values. This list is empty when no point matches them. - `absent`: the points that match the held values and have no value of the measure, each with its reason. A chart can draw each reason apart. - `held`: the value of each other dimension. - `error`: the held-out error. |
| `statistics.smoothLawScores` | This function gives the mean log density of the values under each smooth law, at the closed-form fit of that law. Each law has 2 fitted numbers, so the function adds no penalty. The uniform, the shifted exponential and the Pareto law take the smallest value as their lower limit. This fitted end helps them at small sizes. All values are exact maximum likelihoods. The function throws a RangeError for an empty list, for a value that is not positive and finite, or for equal values. |
| `statistics.sobolIndices` | This function gives the first-order and the total Sobol index of each dimension of a record, for the model of `measure`. The indices are of the prediction of the model, not of the measured points. |
| `statistics.sorted` | A new list with the values from the smallest to the largest. |
| `statistics.spearman` | The Spearman rank correlation: the Pearson correlation of the ranks, with mean ranks for ties. The value is from -1 to 1. When one list has no spread, the value is 0. It is equal to the copy in the backtest of highways. |
| `statistics.strengthToRating` | The rating of a log-strength: `center + scale * strength / ln(base)`. The defaults give `1500 + 400 * log10(e) * strength`. Thus `eloExpected` of two ratings is the Bradley-Terry win probability. |
| `statistics.summarize` | _(no description)_ |
| `statistics.surfaceResponse` | This function gives the view of `sliceResponse` over two dimensions. The fields `x` and `y` are the two axes, and `cells` has one row for each value of `y`. The rules of the held values, of the matching points and of the band are the rules of `sliceResponse`. The function also throws a RangeError when the two varied dimensions are one dimension. It throws when a conditional dimension varies with its parent, and when two varied dimensions need no common level. |
| `statistics.tQuantile` | This function gives the quantile of the Student t law, from a bisection of its distribution function. |
| `statistics.twoSamplePermutation` | The two-sample permutation test (a split of the pooled values). It needs no normal distribution and no pairs, so it compares groups of different sizes. The p holds only if the values of the two groups can change places under the null. |
| `statistics.uStatisticInterval` | This function gives the interval of a total over all the sets of `r` units of a population. The data is a uniform sample of `m` of the `n` units, without replacement. An example is the count of crossings between all pairs of routes. The input is the total of each sampled unit: the sum of the kernel over the sets of `r` sampled units that hold the unit. Thus the sum of the totals is `r * S`, with `S` the total of the sample. The kernel is symmetric. |
| `statistics.whenHolds` | This function gives true when a place has the condition of a dimension. A dimension with no condition is present. |
| `statistics.wilson` | The Wilson score interval of `k` successes in `n` trials (Wilson, 1927). It keeps its level for a small n and for a proportion near 0 or 1, where the normal interval does not. For n = 0 the interval is 0 to 1. |
| `statistics.wilsonSampleSize` | The smallest number of trials `n` at which the Wilson lower end reaches `target`, when the true proportion is `expected`. Each `n` takes `round(expected × n)` successes. The function gives `undefined` when `expected` is not above `target`, or when no `n` up to `max` reaches it. An audit of an agreement uses it to fix its size. |

## systems

| Procedure | Description |
|-----------|-------------|
| `systems.timers` | The verdicts of the timer law for the timer settings of an application |

## tailscale

| Procedure | Description |
|-----------|-------------|
| `tailscale.run` | Run a tailscale command (status, ip, serve, up, down) |

## vite

| Procedure | Description |
|-----------|-------------|
| `vite.build` | Build for production |
| `vite.dev` | Start Vite dev server |
| `vite.preview` | Preview production build |
| `vite.stop` | Stop a running Vite server |

## vitest

| Procedure | Description |
|-----------|-------------|
| `vitest.coverage` | Run vitest once with coverage, and check a minimum line coverage (no shell) |
| `vitest.list` | List the vitest watch processes of this host |
| `vitest.run` | Run vitest tests once (no shell; uses the project's own vitest) |
| `vitest.stop` | Stop a vitest watch process (all of them without an id) |
| `vitest.watch` | Start vitest in watch mode (no shell; uses the project's own vitest) |

## weather

| Procedure | Description |
|-----------|-------------|
| `weather.forecast` | Give the weather forecast of a point for each day, and optionally each hour (Open-Meteo) |

## yaml

| Procedure | Description |
|-----------|-------------|
| `yaml.parse` | Parse YAML text into a JSON value |
| `yaml.stringify` | Write a JSON value as YAML text |

