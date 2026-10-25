import { afterEach, describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { decodeWords, htmlText, messageHeaders, messageText, parseAddresses } from "./mime.js";
import { readHeaders, type ImapClientLike } from "./imap.js";
import { mailProcedures, setImapClientFactory } from "./procedures.js";

/** Made-up messages. */
const plain = ["From: Ada Example <ada@example.org>", "To: team@example.org", "Subject: Hello", "", "Line one", "Line two"].join("\r\n");

const multipart = [
  "From: =?UTF-8?Q?Bj=C3=B6rn?= <bjorn@example.org>",
  "Subject: =?UTF-8?B?w4ljbGFpcg==?=",
  'Content-Type: multipart/alternative; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/html; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<p>Total: =2410.00</p><table><tr><td>A</td><td>B</td></tr></table>",
  "--b1",
  "Content-Type: application/pdf",
  "Content-Disposition: attachment; filename=x.pdf",
  "",
  "JVBERi0=",
  "--b1--",
  "epilogue is not content",
].join("\r\n");

describe("mime", () => {
  it("reads the headers and the plain text", () => {
    expect(messageHeaders(plain).get("subject")).toBe("Hello");
    expect(messageText(plain)).toBe("Line one\nLine two");
  });

  it("reads an HTML-only multipart message as lines, and skips the attachment and the epilogue", () => {
    expect(messageText(multipart)).toBe("Total: $10.00\nA\nB");
  });

  it("decodes encoded words, B and Q", () => {
    expect(decodeWords("=?UTF-8?B?w4ljbGFpcg==?=")).toBe("Éclair");
    expect(decodeWords("=?UTF-8?Q?Bj=C3=B6rn_A?=")).toBe("Björn A");
  });

  it("keeps &amp;lt; as the text &lt;", () => {
    expect(htmlText("<b>a &amp;lt; b</b>")).toBe("a &lt; b");
  });

  it("gives U+FFFD for a numeric entity above U+10FFFF, and does not throw", () => {
    expect(htmlText("<p>a &#99999999; b &#x110000; c &#65;</p>")).toBe("a � b � c A");
  });

  it("reads the addresses of a header, with quoted commas", () => {
    expect(parseAddresses('"Example, Ada" <ada@example.org>, bob@example.org, nobody')).toEqual([
      { name: "Example, Ada", address: "ada@example.org" },
      { address: "bob@example.org" },
    ]);
  });
});

/** A made-up IMAP mailbox. */
function fakeClient(log: string[], options: { hang?: boolean } = {}): ImapClientLike {
  return {
    connect: async () => {
      log.push("connect");
      if (options.hang) await new Promise(() => undefined);
    },
    logout: async () => void log.push("logout"),
    close: () => void log.push("close"),
    getMailboxLock: async (mailbox, lockOptions) => {
      log.push(`lock ${mailbox} readOnly=${String(lockOptions?.readOnly)}`);
      return { release: () => void log.push("release") };
    },
    async *fetch() {
      yield { uid: 7, flags: new Set(["\\Seen"]), envelope: { subject: "Old", date: new Date("2026-10-01T10:00:00Z"), from: [{ address: "a@example.org" }] } };
      yield { uid: 9, flags: new Set<string>(), envelope: { subject: "New", from: [{ name: "Bob", address: "b@example.org" }] } };
    },
  };
}

describe("readHeaders", () => {
  it("opens the mailbox read only and gives the newest first, at most the limit", async () => {
    const log: string[] = [];
    const headers = await readHeaders(
      { host: "imap.example.org", port: 993, secure: true, user: "u", password: "p" },
      { mailbox: "INBOX", since: new Date(0), limit: 1, timeoutMs: 1000, clientFactory: async () => fakeClient(log) }
    );
    expect(headers).toEqual([{ uid: 9, subject: "New", from: [{ name: "Bob", address: "b@example.org" }], to: [], seen: false }]);
    expect(log).toEqual(["connect", "lock INBOX readOnly=true", "release", "logout"]);
  });

  it("closes the connection at the time limit", async () => {
    const log: string[] = [];
    const call = readHeaders(
      { host: "imap.example.org", port: 993, secure: true, user: "u", password: "p" },
      { mailbox: "INBOX", since: new Date(0), limit: 10, timeoutMs: 20, clientFactory: async () => fakeClient(log, { hang: true }) }
    );
    // The fake client does not end connect() on close(), as a real one does: race it
    await expect(Promise.race([call, new Promise((resolve) => setTimeout(() => resolve("pending"), 100))])).resolves.toBe("pending");
    expect(log).toContain("close");
  });
});

describe("the procedures", () => {
  const registry = new ProcedureRegistry();
  for (const procedure of mailProcedures) registry.register(procedure);
  const call = async <T>(path: string[], input: unknown): Promise<T> =>
    (await outputValue(await invokePath(path, input, { registry }), path)) as T;

  afterEach(() => {
    setImapClientFactory(undefined);
    delete process.env["IMAP_TEST_PASSWORD"];
  });

  it("mail.parse gives the subject, the addresses and the text", async () => {
    const result = await call<{ subject: string; from: unknown[]; text: string }>(["mail", "parse"], { raw: multipart });
    expect(result).toMatchObject({ subject: "Éclair", from: [{ name: "Björn", address: "bjorn@example.org" }], text: "Total: $10.00\nA\nB" });
  });

  it("mail.headers reads the password from the environment, never from the input", async () => {
    await expect(call(["mail", "headers"], { host: "imap.example.org", user: "u", passwordEnv: "IMAP_TEST_PASSWORD" })).rejects.toThrow(
      /Set the environment variable IMAP_TEST_PASSWORD/
    );
    let seen: string | undefined;
    setImapClientFactory(async (connection) => {
      seen = connection.password;
      return fakeClient([]);
    });
    process.env["IMAP_TEST_PASSWORD"] = "made-up";
    const result = await call<{ messages: unknown[] }>(["mail", "headers"], { host: "imap.example.org", user: "u", passwordEnv: "IMAP_TEST_PASSWORD" });
    expect(result.messages).toHaveLength(2);
    expect(seen).toBe("made-up");
  });

  // Audit pass 2 (O55): before, passwordEnv could name any variable, and the caller chose the host
  it("mail.headers refuses a variable without the prefix IMAP_ or MAIL_, and connects to no host", async () => {
    let connected = false;
    setImapClientFactory(async () => {
      connected = true;
      return fakeClient([]);
    });
    process.env["MAIL_AUDIT_SECRET"] = "made-up";
    try {
      for (const passwordEnv of ["GITHUB_TOKEN", "ANTHROPIC_API_KEY", "PATH", "imap_password", "IMAP_", "XIMAP_PASSWORD"]) {
        await expect(call(["mail", "headers"], { host: "imap.example.org", user: "u", passwordEnv }), passwordEnv).rejects.toThrow(/starts with IMAP_ or MAIL_/);
      }
      expect(connected).toBe(false);
      // The prefix MAIL_ and the default IMAP_PASSWORD stay valid
      expect((await call<{ messages: unknown[] }>(["mail", "headers"], { host: "imap.example.org", user: "u", passwordEnv: "MAIL_AUDIT_SECRET" })).messages).toHaveLength(2);
      expect(connected).toBe(true);
    } finally {
      delete process.env["MAIL_AUDIT_SECRET"];
    }
  });
});
