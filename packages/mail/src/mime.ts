/**
 * The headers and the readable text of a raw RFC 822 message. It reads multipart bodies,
 * quoted-printable and base64, and HTML-only messages. It is not a mail client: it ignores
 * attachments, inline images and the headers of the parts.
 */

interface Parsed {
  readonly headers: ReadonlyMap<string, string>;
  /** The body, still in its transfer encoding, one character for each byte */
  readonly body: string;
}

const split = (text: string): Parsed => {
  const at = text.search(/\r?\n\r?\n/);
  const head = at === -1 ? text : text.slice(0, at);
  const body = at === -1 ? "" : text.slice(at).replace(/^\r?\n\r?\n/, "");
  const headers = new Map<string, string>();
  // A header continues on each line that starts with white space (RFC 5322 folding)
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return { headers, body };
};

const param = (value: string, name: string): string | undefined => {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i").exec(value);
  return match?.[1] ?? match?.[2];
};

const quotedPrintable = (text: string): string =>
  text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

const decode = (body: string, encoding: string | undefined, charset: string | undefined): string => {
  const transfer = (encoding ?? "7bit").toLowerCase();
  const bytes =
    transfer === "base64"
      ? Buffer.from(body.replace(/\s+/g, ""), "base64")
      : transfer === "quoted-printable"
        ? Buffer.from(quotedPrintable(body), "latin1")
        : Buffer.from(body, "latin1");
  const set = (charset ?? "utf-8").toLowerCase();
  return set === "utf-8" || set === "utf8" || set === "us-ascii" ? bytes.toString("utf8") : bytes.toString("latin1");
};

const ENTITIES: Readonly<Record<string, string>> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

/** A code point above U+10FFFF has no character. It becomes U+FFFD, so a bad entity does not throw. */
const codePoint = (code: number): string => (code <= 0x10ffff ? String.fromCodePoint(code) : "�");

/** `&amp;` is the last replacement, so `&amp;lt;` stays the text "&lt;". */
const entities = (text: string): string =>
  text
    .replace(/&#(\d+);/g, (_, code: string) => codePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/&amp;/gi, "&");

/** This function gives the text of an HTML body as lines. A cell, a row, a paragraph or a break ends a line. */
export const htmlText = (html: string): string =>
  entities(
    html
      .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|tr|td|th|li|h[1-6]|table|tbody|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

const walk = (text: string, plain: string[], html: string[], depth: number): void => {
  if (depth > 8) return;
  const { headers, body } = split(text);
  const type = headers.get("content-type") ?? "text/plain";
  const mime = (type.split(";")[0] ?? "").trim().toLowerCase();
  if (mime.startsWith("multipart/")) {
    const boundary = param(type, "boundary");
    if (boundary === undefined) return;
    const delimiter = `--${boundary}`;
    let current: string[] | undefined;
    for (const line of body.split(/\r?\n/)) {
      if (line.startsWith(delimiter)) {
        if (current !== undefined) walk(current.join("\r\n"), plain, html, depth + 1);
        // After the closing delimiter comes the epilogue, which is not content
        if (line.startsWith(`${delimiter}--`)) return;
        current = [];
        continue;
      }
      current?.push(line);
    }
    if (current !== undefined) walk(current.join("\r\n"), plain, html, depth + 1);
    return;
  }
  if (!mime.startsWith("text/")) return;
  if (/^attachment/i.test(headers.get("content-disposition") ?? "")) return;
  const decoded = decode(body, headers.get("content-transfer-encoding"), param(type, "charset"));
  if (mime === "text/html") html.push(decoded);
  else if (mime === "text/plain") plain.push(decoded);
};

const asText = (raw: Uint8Array | string): string => (typeof raw === "string" ? raw : Buffer.from(raw).toString("latin1"));

/** This function gives the top-level headers of a raw message, unfolded, with lowercase names. */
export const messageHeaders = (raw: Uint8Array | string): ReadonlyMap<string, string> => split(asText(raw)).headers;

/** This function decodes the RFC 2047 encoded words (`=?UTF-8?Q?...?=`) of a header value. */
export const decodeWords = (value: string): string =>
  value.replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset: string, encoding: string, text: string) => {
    const bytes =
      encoding.toUpperCase() === "B" ? Buffer.from(text, "base64") : Buffer.from(quotedPrintable(text.replace(/_/g, " ")), "latin1");
    return /^utf-?8$/i.test(charset) ? bytes.toString("utf8") : bytes.toString("latin1");
  });

/** This function gives the text of a message: its plain parts, or its HTML as lines when it has no plain part. */
export const messageText = (raw: Uint8Array | string): string => {
  const plain: string[] = [];
  const html: string[] = [];
  walk(asText(raw), plain, html, 0);
  if (plain.some((part) => part.trim().length > 0)) {
    return plain
      .join("\n")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t ]+/g, " ")
      .trim();
  }
  return html.map(htmlText).join("\n").trim();
};

/** An address of a header: `Name <user@host>`, `<user@host>` or `user@host`. */
export interface MailAddress {
  readonly name?: string | undefined;
  readonly address: string;
}

/** This function reads the addresses of an address header (From, To, Cc). */
export const parseAddresses = (value: string): MailAddress[] => {
  const out: MailAddress[] = [];
  // Commas inside quotes do not separate addresses
  for (const part of value.match(/(?:"[^"]*"|[^,])+/g) ?? []) {
    const text = decodeWords(part.trim());
    const angle = /^(.*?)<([^<>]+)>\s*$/.exec(text);
    const address = (angle ? angle[2] : text)?.trim() ?? "";
    if (!address.includes("@")) continue;
    const name = angle?.[1]?.trim().replace(/^"|"$/g, "").trim();
    out.push(name ? { name, address } : { address });
  }
  return out;
};
