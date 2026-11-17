/**
 * The check of the bytes of a tarball against its integrity text, as npm writes it in `dist.integrity`. The text has
 * the form of W3C Subresource Integrity: a list of `<algorithm>-<base64 hash>` items, with spaces between them.
 *
 * The check uses `crypto.subtle` of the Web Crypto API, so it works in Node.js and in a browser.
 */
import type { RegistryDist } from "./registry.js";

/** The hash algorithms that the check knows, from the weakest to the strongest. */
export const INTEGRITY_ALGORITHMS = ["sha1", "sha256", "sha384", "sha512"] as const;

/** One hash algorithm that the check knows. */
export type IntegrityAlgorithm = (typeof INTEGRITY_ALGORITHMS)[number];

const DIGEST_NAME: Readonly<Record<IntegrityAlgorithm, string>> = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };

/** The result of `checkIntegrity`. */
export interface IntegrityCheck {
  /** This field is `true` when the hash of the bytes is equal to one hash of `algorithm` in the text. */
  readonly ok: boolean;
  /** The strongest algorithm in the text that the check knows, or `null` when the text has no hash that the check knows. */
  readonly algorithm: IntegrityAlgorithm | null;
  /** The hash of the bytes with `algorithm`, in base64, or `null` when `algorithm` is `null`. */
  readonly actual: string | null;
}

interface IntegrityHash {
  readonly algorithm: IntegrityAlgorithm;
  readonly digest: string;
}

const ITEM = /^([a-z0-9]+)-([A-Za-z0-9+/]+={0,2})(?:\?.*)?$/;

const isAlgorithm = (name: string): name is IntegrityAlgorithm => (INTEGRITY_ALGORITHMS as readonly string[]).includes(name);

/** This function gives the hashes of an integrity text that the check knows. It ignores the options after a `?`. */
function hashesOf(integrity: string): IntegrityHash[] {
  const hashes: IntegrityHash[] = [];
  for (const item of integrity.trim().split(/\s+/)) {
    const match = ITEM.exec(item);
    const algorithm = match?.[1];
    const digest = match?.[2];
    if (algorithm !== undefined && digest !== undefined && isAlgorithm(algorithm)) hashes.push({ algorithm, digest });
  }
  return hashes;
}

/** This function gives the bytes of a base64 text as a binary string, or `null` when the text is not valid base64. */
function decoded(base64: string): string | null {
  try {
    return atob(base64);
  } catch {
    return null;
  }
}

const binaryOf = (bytes: Uint8Array): string => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

/**
 * This function checks bytes against an integrity text. It uses the strongest algorithm in the text, as W3C Subresource
 * Integrity does. The bytes pass when their hash is equal to one hash of that algorithm.
 *
 * The check fails when the text has no hash that the check knows. Like npm, the check knows `sha1`, the hash of old
 * versions. A stronger hash in the same text replaces it.
 */
export async function checkIntegrity(bytes: Uint8Array | ArrayBuffer, integrity: string): Promise<IntegrityCheck> {
  const hashes = hashesOf(integrity);
  let algorithm: IntegrityAlgorithm | null = null;
  for (const name of INTEGRITY_ALGORITHMS) if (hashes.some((hash) => hash.algorithm === name)) algorithm = name;
  if (algorithm === null) return { ok: false, algorithm: null, actual: null };
  // `crypto.subtle` takes no view of a `SharedArrayBuffer`, so the function copies such a view.
  const data = bytes instanceof ArrayBuffer ? bytes : bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
  const binary = binaryOf(new Uint8Array(await crypto.subtle.digest(DIGEST_NAME[algorithm], data)));
  const ok = hashes.some((hash) => hash.algorithm === algorithm && decoded(hash.digest) === binary);
  return { ok, algorithm, actual: btoa(binary) };
}

/**
 * This function gives the integrity text to check for the tarball of a version. It gives `integrity`. For an old
 * version with only `shasum`, it gives the `sha1` text of that hash. It gives `null` when the facts have neither.
 */
export function tarballIntegrity(dist: Pick<RegistryDist, "integrity" | "shasum">): string | null {
  if (dist.integrity !== null) return dist.integrity;
  const shasum = dist.shasum;
  if (shasum === null || !/^[0-9a-f]{40}$/i.test(shasum)) return null;
  let binary = "";
  for (let i = 0; i < shasum.length; i += 2) binary += String.fromCharCode(Number.parseInt(shasum.slice(i, i + 2), 16));
  return `sha1-${btoa(binary)}`;
}
