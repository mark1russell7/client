/**
 * The status page: the live board of the open work, the pull requests and the issues
 * (`components/StatusBoard.tsx`), and the history below it. The build reads the roadmap file and
 * GitHub, so the board cannot go stale. The history is the October deep dive and the July
 * register. It loads only when the reader opens it.
 */

import { lazy, Suspense, useState, type ReactElement } from "react";
import { StatusBoard } from "../components/StatusBoard";
import { statusBoard } from "../data/status-board";
import { href, type Route } from "../lib/router";

const StatusHistory = lazy(() => import("./StatusHistory"));

function History(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <section className="board-section status-history" aria-labelledby="history">
      <h2 id="history">History</h2>
      <details className="status-history-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>The October deep dive and the July bug register</summary>
        {open ? (
          <Suspense
            fallback={
              <p className="muted small" data-loading="">
                The history loads.
              </p>
            }
          >
            <StatusHistory />
          </Suspense>
        ) : null}
      </details>
    </section>
  );
}

export function Status({ route }: { route: Route }): ReactElement {
  return (
    <div className="status-page">
      <StatusBoard
        data={statusBoard}
        route={route}
        page="status"
        intro={
          <p className="small">
            What shipped, version by version: <a href={href("releases")}>Releases</a>.
          </p>
        }
      />
      <History />
    </div>
  );
}
