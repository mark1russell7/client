import type { ReactElement } from "react";
import { href } from "../lib/router";

/** The page of an address that has no page: a mistyped link, or a procedure that is not in the catalog any more. */
export function NotFound({ path }: { path: string }): ReactElement {
  return (
    <section className="not-found">
      <p className="eyebrow">404</p>
      <h1>This address has no page</h1>
      <p className="lead">
        The site has no page at <code>/{path}</code>. A procedure can have a new name, or the link can have an error.
      </p>
      <div className="hero-actions">
        <a className="primary" href={href("")}>
          Go to the home page
        </a>
        <a className="secondary" href={href("catalog")}>
          Search the procedures
        </a>
      </div>
    </section>
  );
}
