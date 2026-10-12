/**
 * The change from the HTML of the build to the live app, with no flash (from the
 * AsyncBrowserContext site).
 *
 * The build saves the HTML of each static page in its root element. The app renders into a
 * hidden element next to it, and shows that element when it is ready. The reader sees the
 * full page from the first frame.
 */

import type { RootOptions } from "react-dom/client";
import { LOADING_SELECTOR, PRERENDERED_ATTRIBUTE } from "./readiness";

/** The element and the options for `createRoot`. */
export interface AppMount {
  element: HTMLElement;
  options: RootOptions;
}

export interface HandoffTimes {
  /** The time without DOM changes before the swap, in milliseconds. */
  quietMs?: number;
  /** The maximum time from the first ready state to the swap, in milliseconds. */
  settleMs?: number;
  /** The maximum time to the swap, in milliseconds. After it, the swap occurs also when an element still loads. */
  timeoutMs?: number;
}

/** The ID prefix of `useId()` in the hidden render. The HTML from the build has IDs without this prefix. */
export const HANDOFF_ID_PREFIX = "app-";

// The width of the root element, no effect on the page height, and no access for the reader.
const HIDDEN_STYLE = "position:absolute;top:0;left:0;right:0;height:0;overflow:clip;opacity:0;visibility:hidden;pointer-events:none";

/** This function starts `done` one time, when no element in `root` loads and the DOM in `root` does not change for `quietMs`. */
export function whenReady(root: HTMLElement, done: () => void, times: HandoffTimes = {}): void {
  const { quietMs = 100, settleMs = 1000, timeoutMs = 10_000 } = times;
  let finished = false;
  let quietTimer: number | undefined;
  let settleTimer: number | undefined;
  let observer: MutationObserver | undefined;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    observer?.disconnect();
    window.clearTimeout(quietTimer);
    window.clearTimeout(settleTimer);
    window.clearTimeout(deadline);
    done();
  };
  const check = (): void => {
    window.clearTimeout(quietTimer);
    if (root.firstElementChild === null || root.querySelector(LOADING_SELECTOR) !== null) {
      window.clearTimeout(settleTimer);
      settleTimer = undefined;
      return;
    }
    quietTimer = window.setTimeout(finish, quietMs);
    settleTimer ??= window.setTimeout(finish, settleMs);
  };

  observer = new MutationObserver(check);
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  const deadline = window.setTimeout(finish, timeoutMs);
  check();
}

/**
 * This function gives the element that the app renders into.
 *
 * Without HTML from the build, it gives `container`. With HTML from the build for the same
 * route, it adds a hidden element after `container`, and the app renders into it. When the
 * page is ready, the function removes `container` and shows the new element. HTML of another
 * route (`404.html` holds none, but a server can serve a wrong file) is removed at once.
 */
export function mountApp(container: HTMLElement, routePath: string, times?: HandoffTimes, query = ""): AppMount {
  const prerendered = container.getAttribute(PRERENDERED_ATTRIBUTE);
  if (prerendered === null) return { element: container, options: {} };
  // A query changes the page (a program, an example, filters), and the HTML of the build shows
  // the page without it: the app renders at once, with no wrong content first
  if (prerendered !== routePath || query !== "") {
    container.replaceChildren();
    container.removeAttribute(PRERENDERED_ATTRIBUTE);
    return { element: container, options: {} };
  }

  const live = document.createElement("div");
  live.setAttribute("style", HIDDEN_STYLE);
  live.inert = true;
  container.after(live);
  whenReady(
    live,
    () => {
      const id = container.id;
      const scroll = window.scrollY;
      container.remove();
      live.removeAttribute("style");
      live.inert = false;
      live.id = id;
      // The reader can have scrolled the static page: the live page keeps the position
      window.scrollTo({ top: scroll });
    },
    times,
  );
  return { element: live, options: { identifierPrefix: HANDOFF_ID_PREFIX } };
}
