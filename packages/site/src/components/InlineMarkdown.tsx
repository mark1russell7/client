/**
 * Inline Markdown of the status documents: code spans, bold text and links. A relative link
 * goes to the file on GitHub, next to the document that has it.
 */

import type { ReactElement, ReactNode } from "react";

const TOKEN = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
const REPOSITORY = "https://github.com/mark1russell7/client/blob/main";

/** The URL of a link target: an absolute URL stays, a relative one goes to GitHub next to `base`. */
export function linkTarget(target: string, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return target;
  const parts = base.split("/").filter(Boolean);
  for (const part of target.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${REPOSITORY}/${parts.join("/")}`;
}

/** The parts of a text: strings and the Markdown tokens in it. */
export function InlineMarkdown({ text, base = "" }: { text: string; base?: string }): ReactElement {
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = match.index;
    if (match[1] !== undefined) parts.push(<code key={key}>{match[1]}</code>);
    else if (match[2] !== undefined) parts.push(<strong key={key}>{match[2]}</strong>);
    else parts.push(
      <a key={key} href={linkTarget(match[4]!, base)}>
        {match[3]}
      </a>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
