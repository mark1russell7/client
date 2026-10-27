/**
 * The auto-warm of `mark` (CLI-27): start the background host after a cold command.
 *
 * - The setting `MARK_AUTO_WARM` has the values `never` (the default) and `after-cold`. The
 *   default is `never`, because each background host holds the procedures in memory.
 * - With `after-cold`, a command that ran in this process (the cold mode) starts `mark --server`
 *   as a detached process before it exits. Thus the next command in this folder finds a warm host.
 * - The background host stops by itself after `MARK_IDLE_TIMEOUT_MS` with no call (the default is
 *   10 minutes). The spawn gives it `--idle-timeout`. A host that a user starts has no idle stop.
 * - The command does not start a host when a warm host of this folder runs, or when another
 *   command starts one (the start claim). It also does not start one when another program holds the port.
 * - The auto-warm does not change the result or the exit code of the command at any time.
 *
 * The spawn is `spawnMarkServer()` of `@procedures/server`, the start of `server.start`. It does
 * not use `runCommand()` or `shell.run`, because the host must outlive the command.
 * `SERVER-LAYERS.md` records this exception.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { connect } from "node:net";
import { checkServer, findServer, getMarkDir, readLockfileForPort } from "@procedures/peer/lockfile";

/** The values of the setting `MARK_AUTO_WARM`. */
export const AUTO_WARM_SETTINGS = ["never", "after-cold"] as const;

/** The setting of the auto-warm: `never`, or `after-cold`. */
export type AutoWarmSetting = (typeof AUTO_WARM_SETTINGS)[number];

/** The environment variable of the setting. */
export const AUTO_WARM_ENV = "MARK_AUTO_WARM";

/** The environment variable of the idle stop of the host that the auto-warm starts, in milliseconds. */
export const IDLE_TIMEOUT_ENV = "MARK_IDLE_TIMEOUT_MS";

/** The environment variable of the port of the host that the auto-warm starts. */
export const AUTO_WARM_PORT_ENV = "MARK_AUTO_WARM_PORT";

/** The default idle stop of the host that the auto-warm starts: 10 minutes. */
export const DEFAULT_IDLE_TIMEOUT_MS = 600_000;

/** The default port of the host that the auto-warm starts: the default port of `mark --server`. */
export const DEFAULT_AUTO_WARM_PORT = 3000;

/**
 * The age after which a start claim is stale: 60 s. The startup of a host has a cap of 30 s. A
 * claim also goes stale when its process ended.
 */
export const START_CLAIM_MAX_AGE_MS = 60_000;

/** The configuration of the auto-warm. */
export interface AutoWarmConfig {
  readonly setting: AutoWarmSetting;
  /** The idle stop of the host, in milliseconds. */
  readonly idleTimeoutMs: number;
  /** The port of the host. */
  readonly port: number;
  /** The address of the host: loopback. */
  readonly host: string;
}

/**
 * This function reads the milliseconds of an idle stop: a whole number of 1 or more. An
 * invalid value is an error, and the error names the option.
 */
export function parseIdleTimeout(value: string, option = "--idle-timeout"): number {
  const timeout = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  if (!Number.isSafeInteger(timeout) || timeout < 1) {
    throw new Error(`Invalid ${option}: "${value}". Give a number of milliseconds of 1 or more.`);
  }
  return timeout;
}

/**
 * This function gives the configuration of the auto-warm from the environment. An unset or empty
 * variable gives its default. An invalid value is an error.
 */
export function autoWarmConfig(env: Readonly<Record<string, string | undefined>> = process.env): AutoWarmConfig {
  const given = env[AUTO_WARM_ENV]?.trim() ?? "";
  const setting = given === "" ? "never" : AUTO_WARM_SETTINGS.find((each) => each === given);
  if (setting === undefined) {
    throw new Error(`Invalid ${AUTO_WARM_ENV}: "${given}". Give one of: ${AUTO_WARM_SETTINGS.join(", ")}.`);
  }
  const idle = env[IDLE_TIMEOUT_ENV]?.trim() ?? "";
  const portText = env[AUTO_WARM_PORT_ENV]?.trim() ?? "";
  const port = portText === "" ? DEFAULT_AUTO_WARM_PORT : Number(portText);
  if (!/^\d+$/.test(portText === "" ? "0" : portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${AUTO_WARM_PORT_ENV}: "${portText}". Give a number from 1 to 65535.`);
  }
  return {
    setting,
    idleTimeoutMs: idle === "" ? DEFAULT_IDLE_TIMEOUT_MS : parseIdleTimeout(idle, IDLE_TIMEOUT_ENV),
    port,
    host: "127.0.0.1",
  };
}

/** The facts of the decision of the auto-warm. */
export interface WarmFacts {
  readonly setting: AutoWarmSetting;
  /** True when a warm host of this folder, build and root runs (`findServer()`). */
  readonly warmHost: boolean;
  /** True when another command claimed the start of a host, and the claim is not stale. */
  readonly starting: boolean;
  /** True when a server or another program holds the port. */
  readonly portBusy: boolean;
}

/** The decision of the auto-warm: start a host, or not, and why. */
export type WarmDecision = { readonly spawn: true } | { readonly spawn: false; readonly reason: string };

/** This function decides if a cold command starts the background host. */
export function decideAutoWarm(facts: WarmFacts): WarmDecision {
  if (facts.setting === "never") return { spawn: false, reason: `${AUTO_WARM_ENV} is never` };
  if (facts.warmHost) return { spawn: false, reason: "a warm host runs" };
  if (facts.starting) return { spawn: false, reason: "another command starts the host" };
  if (facts.portBusy) return { spawn: false, reason: "the port is in use" };
  return { spawn: true };
}

/** The steps of the auto-warm. The tests give fakes, so no test starts a process or opens a port. */
export interface AutoWarmSteps {
  /** This function tells if a warm host of this folder, build and root runs. */
  findWarmHost(): Promise<boolean>;
  /** This function claims the start of the host. It gives false when another command has a claim that is not stale. */
  claimStart(): boolean;
  /** This function writes the process ID of the new host in the claim. */
  recordStart(pid: number): void;
  /** This function removes the claim of this command. */
  releaseStart(): void;
  /** This function tells if a server or another program holds the port. */
  portBusy(): Promise<boolean>;
  /** This function starts the host as a detached process, and gives its process ID. */
  spawn(): number | undefined;
}

/**
 * This function does the auto-warm after a cold command, and gives the decision. The claim
 * makes the decision atomic: of two cold commands at the same time, only one starts a host.
 */
export async function autoWarm(setting: AutoWarmSetting, steps: AutoWarmSteps): Promise<WarmDecision> {
  const facts = { setting, warmHost: false, starting: false, portBusy: false };
  if (setting === "never") return decideAutoWarm(facts);
  facts.warmHost = await steps.findWarmHost();
  if (facts.warmHost) return decideAutoWarm(facts);
  facts.starting = !steps.claimStart();
  if (facts.starting) return decideAutoWarm(facts);
  try {
    facts.portBusy = await steps.portBusy();
    const decision = decideAutoWarm(facts);
    if (!decision.spawn) {
      steps.releaseStart();
      return decision;
    }
    const pid = steps.spawn();
    if (pid === undefined) {
      steps.releaseStart();
      return { spawn: false, reason: "the host process did not start" };
    }
    steps.recordStart(pid);
    return decision;
  } catch (error) {
    steps.releaseStart();
    throw error;
  }
}

/** The content of a start claim: the time of the claim and, after the spawn, the process ID of the host. */
interface StartClaim {
  readonly at: number;
  readonly pid?: number | undefined;
}

/** The options of `startClaim()`. */
export interface StartClaimOptions {
  /** The folder of the claim. The default is `~/.mark`. */
  readonly dir?: string | undefined;
  /** This function gives the time, in milliseconds. The default is `Date.now`. */
  readonly now?: (() => number) | undefined;
  /** This function tells if a process runs. The default is `process.kill(pid, 0)`. */
  readonly alive?: ((pid: number) => boolean) | undefined;
  /** The age after which a claim is stale. The default is `START_CLAIM_MAX_AGE_MS`. */
  readonly maxAgeMs?: number | undefined;
}

/** True when a process runs. A process of another user also runs (`EPERM`). */
function processRuns(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * This function gives the start claim of a port: the file `~/.mark/auto-warm-<port>.claim`. The
 * file is made with the flag `wx`, so only one command gets the claim. A claim is stale after
 * `maxAgeMs`, or when its process ended. A stale claim goes, and the next command can claim again.
 */
export function startClaim(port: number, options: StartClaimOptions = {}): Pick<AutoWarmSteps, "claimStart" | "recordStart" | "releaseStart"> {
  const dir = options.dir ?? getMarkDir();
  const file = path.join(dir, `auto-warm-${port}.claim`);
  const now = options.now ?? Date.now;
  const alive = options.alive ?? processRuns;
  const maxAgeMs = options.maxAgeMs ?? START_CLAIM_MAX_AGE_MS;
  let owned = false;
  const write = (claim: StartClaim, flag: "wx" | "w"): void => {
    fs.writeFileSync(file, JSON.stringify(claim), { flag, mode: 0o600 });
  };
  const stale = (): boolean => {
    let claim: StartClaim;
    try {
      claim = JSON.parse(fs.readFileSync(file, "utf8")) as StartClaim;
    } catch (error) {
      // No file: the claim went at this time. A file that does not parse is stale.
      return (error as NodeJS.ErrnoException).code !== "ENOENT";
    }
    if (typeof claim.at !== "number" || now() - claim.at >= maxAgeMs) return true;
    return claim.pid !== undefined && !alive(claim.pid);
  };
  const tryClaim = (): boolean => {
    try {
      write({ at: now() }, "wx");
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  };
  return {
    claimStart() {
      fs.mkdirSync(dir, { recursive: true });
      if (tryClaim()) {
        owned = true;
        return true;
      }
      if (!stale()) return false;
      fs.rmSync(file, { force: true });
      owned = tryClaim();
      return owned;
    },
    recordStart(pid) {
      if (owned) write({ at: now(), pid }, "w");
    },
    releaseStart() {
      if (!owned) return;
      owned = false;
      fs.rmSync(file, { force: true });
    },
  };
}

/** This function tells if something accepts a connection on a port, within the time limit. */
export function portAnswers(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (answers: boolean): void => {
      socket.destroy();
      resolve(answers);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/** Where a cold command runs: the folder, the build of `mark` and the root of the files. */
export interface WarmContext {
  readonly cwd: string;
  readonly build: string;
  readonly fsRoot?: string | undefined;
}

/**
 * This function gives the steps of the auto-warm with the lockfiles, the start claim of the port
 * and `spawnMarkServer()` of `@procedures/server`.
 */
export function autoWarmSteps(
  config: AutoWarmConfig,
  context: WarmContext,
  spawnHost: (options: { port: number; host: string; idleTimeoutMs: number; fsRoot?: string | undefined }) => { readonly pid?: number | undefined },
): AutoWarmSteps {
  const claim = startClaim(config.port);
  return {
    ...claim,
    findWarmHost: async () => (await findServer({ cwd: context.cwd, build: context.build, fsRoot: context.fsRoot })) !== null,
    portBusy: async () => {
      // A server of a lockfile on the port: of another folder, build or root
      const lockfile = readLockfileForPort(config.port);
      if (lockfile !== null && (await checkServer(lockfile)) !== "dead") return true;
      return portAnswers(config.host, config.port);
    },
    spawn: () =>
      spawnHost({
        port: config.port,
        host: config.host,
        idleTimeoutMs: config.idleTimeoutMs,
        ...(context.fsRoot !== undefined ? { fsRoot: context.fsRoot } : {}),
      }).pid,
  };
}
