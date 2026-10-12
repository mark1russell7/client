/**
 * The readiness rule of the site (from the AsyncBrowserContext site).
 *
 * A component that loads code or data, or runs a program, shows a placeholder with the
 * attribute `data-loading`. A page is ready when no element in the page has this attribute.
 *
 * - The build waits for a ready page before it saves the HTML of the page (`build/prerender.ts`).
 * - In a page with saved HTML, the app renders into a hidden element. It shows that element
 *   when the page is ready (`prerender-handoff.ts`).
 *
 * Add the attribute only while the placeholder shows. React writes `data-loading={false}` as
 * the text "false", and the rule finds that attribute too: give `undefined` to remove it.
 */
export const LOADING_SELECTOR = "[data-loading]";

/** The attribute of the root element when it holds HTML from the build. Its value is the route of the HTML. */
export const PRERENDERED_ATTRIBUTE = "data-prerendered";
