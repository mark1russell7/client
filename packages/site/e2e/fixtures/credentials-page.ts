/**
 * The entry of the page of `credentials.spec.ts`: the test bundles it for the browser with Vite. It
 * gives the client of `@procedures/client/browser` to the test as `globalThis.procedures`.
 */

import { Client, HttpTransport, pathToMethod } from "@procedures/client/browser";

(globalThis as Record<string, unknown>)["procedures"] = { Client, HttpTransport, pathToMethod };
