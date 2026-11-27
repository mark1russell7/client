/**
 * Base64 (RFC 4648, section 4) for the bytes of an embedded file.
 *
 * The decoder accepts only the canonical form: the standard alphabet, the padding, and zero bits after the last
 * character. Thus each list of bytes has one text, and a document has one form. The functions use `btoa` and `atob`,
 * which Node.js and each browser have.
 *
 * This copy is temporary. Its home is the entry `/base64` of `@mark1russell7/text`. When that entry is on npm, this
 * package imports it, and this file goes.
 */

const CANONICAL = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** The number of bytes that one call of `String.fromCharCode` gets. It keeps the argument list small. */
const BLOCK = 0x8000;

/** This function gives the base64 text of the bytes. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += BLOCK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BLOCK));
  }
  return btoa(binary);
}

/** This function gives the bytes of a canonical base64 text, or undefined for a text that is not canonical. */
export function decodeBase64(text: string): Uint8Array | undefined {
  if (!CANONICAL.test(text)) return undefined;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  // A last character with bits that are not zero decodes, but it is not the canonical text of the bytes.
  return encodeBase64(bytes) === text ? bytes : undefined;
}

/** This function gives the number of bytes of a canonical base64 text, with no decode. */
export function base64Size(text: string): number {
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  return (text.length / 4) * 3 - padding;
}
