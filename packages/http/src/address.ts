/**
 * IP addresses: the parse, the CIDR ranges and the special-purpose ranges (roadmap R38).
 *
 * A public address is an address that the IANA registries of special-purpose addresses do not
 * name. The HTTP procedures refuse each other address by default: loopback, private, link-local,
 * shared (CGNAT), multicast, documentation, benchmarking and reserved addresses. An IPv6 address
 * that holds an IPv4 address (IPv4-mapped, NAT64, 6to4) has the class of the IPv4 address.
 */

import { isIP } from "node:net";

/** An IP address as bytes: 4 bytes for IPv4, 16 bytes for IPv6. */
export type AddressBytes = Uint8Array;

/** The bytes of an IPv4 address in dotted decimal, or undefined. */
function ipv4Bytes(text: string): AddressBytes | undefined {
  const parts = text.split(".");
  if (parts.length !== 4) return undefined;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const part = parts[i]!;
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return undefined;
    const value = Number(part);
    if (value > 255) return undefined;
    bytes[i] = value;
  }
  return bytes;
}

/** The bytes of an IPv6 address, or undefined. A zone (`%eth0`) is removed. */
function ipv6Bytes(text: string): AddressBytes | undefined {
  let address = text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
  const zone = address.indexOf("%");
  if (zone >= 0) address = address.slice(0, zone);
  if (isIP(address) !== 6) return undefined;
  // An IPv4 tail: "::ffff:1.2.3.4"
  const groups: number[] = [];
  const parseGroups = (part: string): number[] | undefined => {
    if (part === "") return [];
    const out: number[] = [];
    for (const group of part.split(":")) {
      if (group.includes(".")) {
        const v4 = ipv4Bytes(group);
        if (!v4) return undefined;
        out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return undefined;
        out.push(parseInt(group, 16));
      }
    }
    return out;
  };
  const double = address.indexOf("::");
  if (double >= 0) {
    const head = parseGroups(address.slice(0, double));
    const tail = parseGroups(address.slice(double + 2));
    if (!head || !tail || head.length + tail.length > 7) return undefined;
    groups.push(...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail);
  } else {
    const all = parseGroups(address);
    if (!all || all.length !== 8) return undefined;
    groups.push(...all);
  }
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

/** The bytes of an IPv4 or IPv6 address (brackets and a zone are allowed), or undefined. */
export function parseAddress(text: string): AddressBytes | undefined {
  return ipv4Bytes(text) ?? ipv6Bytes(text);
}

/** The text of an address: dotted decimal for IPv4, the compressed form for IPv6. */
export function formatAddress(bytes: AddressBytes): string {
  if (bytes.length === 4) return [...bytes].join(".");
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((bytes[i]! << 8) | bytes[i + 1]!);
  // The longest run of two or more zero groups becomes "::"
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLength && j - i >= 2) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  const hex = groups.map((group) => group.toString(16));
  if (bestStart < 0) return hex.join(":");
  return `${hex.slice(0, bestStart).join(":")}::${hex.slice(bestStart + bestLength).join(":")}`;
}

/** A range of addresses: the bytes of its first address and the length of its prefix in bits. */
export interface AddressRange {
  readonly bytes: AddressBytes;
  readonly prefix: number;
}

/** A range from CIDR text (`10.0.0.0/8`, `fd00::/8`) or one address. Undefined for bad text. */
export function parseRange(text: string): AddressRange | undefined {
  const slash = text.lastIndexOf("/");
  const bytes = parseAddress(slash >= 0 ? text.slice(0, slash) : text);
  if (!bytes) return undefined;
  const bits = bytes.length * 8;
  if (slash < 0) return { bytes, prefix: bits };
  const prefixText = text.slice(slash + 1);
  if (!/^[0-9]{1,3}$/.test(prefixText)) return undefined;
  const prefix = Number(prefixText);
  return prefix <= bits ? { bytes, prefix } : undefined;
}

/** True when the range has the address. An IPv4 range does not have an IPv6 address. */
export function rangeHas(range: AddressRange, address: AddressBytes): boolean {
  if (range.bytes.length !== address.length) return false;
  let bits = range.prefix;
  for (let i = 0; bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if ((range.bytes[i]! & mask) !== (address[i]! & mask)) return false;
  }
  return true;
}

function range(text: string): AddressRange {
  const parsed = parseRange(text);
  if (!parsed) throw new Error(`Bad range ${text}`);
  return parsed;
}

/** The IPv4 ranges that are not public, with their names (IANA IPv4 Special-Purpose Address Registry). */
const IPV4_SPECIAL: ReadonlyArray<readonly [AddressRange, string]> = [
  [range("0.0.0.0/8"), "this-network"],
  [range("10.0.0.0/8"), "private"],
  [range("100.64.0.0/10"), "shared (CGNAT)"],
  [range("127.0.0.0/8"), "loopback"],
  [range("169.254.0.0/16"), "link-local"],
  [range("172.16.0.0/12"), "private"],
  [range("192.0.0.0/24"), "IETF protocol assignment"],
  [range("192.0.2.0/24"), "documentation"],
  [range("192.88.99.0/24"), "6to4 relay"],
  [range("192.168.0.0/16"), "private"],
  [range("198.18.0.0/15"), "benchmarking"],
  [range("198.51.100.0/24"), "documentation"],
  [range("203.0.113.0/24"), "documentation"],
  [range("224.0.0.0/4"), "multicast"],
  [range("240.0.0.0/4"), "reserved"],
];

/** The IPv6 ranges in the global unicast range that are not public (IANA IPv6 Special-Purpose Address Registry). */
const IPV6_SPECIAL: ReadonlyArray<readonly [AddressRange, string]> = [
  [range("2001::/23"), "IETF protocol assignment"],
  [range("2001:db8::/32"), "documentation"],
  [range("3fff::/20"), "documentation"],
];

const GLOBAL_UNICAST = range("2000::/3");
const IPV4_MAPPED = range("::ffff:0:0/96");
const NAT64 = range("64:ff9b::/96");
const SIX_TO_FOUR = range("2002::/16");
const IPV6_NAMED: ReadonlyArray<readonly [AddressRange, string]> = [
  [range("::/128"), "unspecified"],
  [range("::1/128"), "loopback"],
  [range("fc00::/7"), "unique local (private)"],
  [range("fe80::/10"), "link-local"],
  [range("fec0::/10"), "site-local"],
  [range("ff00::/8"), "multicast"],
];

/**
 * The class of an address that is not public, or undefined for a public address. The class is a
 * name for a message: `loopback`, `private`, `link-local` and the others.
 */
export function specialClass(address: AddressBytes): string | undefined {
  if (address.length === 4) {
    for (const [special, name] of IPV4_SPECIAL) if (rangeHas(special, address)) return name;
    return undefined;
  }
  // An IPv6 address that holds an IPv4 address has the class of that address
  if (rangeHas(IPV4_MAPPED, address) || rangeHas(NAT64, address)) {
    const inner = specialClass(address.slice(12, 16));
    return inner === undefined ? undefined : `${inner} (in IPv6)`;
  }
  if (rangeHas(SIX_TO_FOUR, address)) {
    const inner = specialClass(address.slice(2, 6));
    return inner === undefined ? undefined : `${inner} (in 6to4)`;
  }
  for (const [special, name] of IPV6_NAMED) if (rangeHas(special, address)) return name;
  if (!rangeHas(GLOBAL_UNICAST, address)) return "reserved";
  for (const [special, name] of IPV6_SPECIAL) if (rangeHas(special, address)) return name;
  return undefined;
}

/** True for a public address: no special-purpose range has it. */
export function isPublicAddress(address: string | AddressBytes): boolean {
  const bytes = typeof address === "string" ? parseAddress(address) : address;
  return bytes !== undefined && specialClass(bytes) === undefined;
}
