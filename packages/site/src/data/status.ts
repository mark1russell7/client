/**
 * The data of the status board. It is a module of its own, so only the code of the status page
 * loads it (the types are in `index.ts`).
 */

import statusJson from "./generated/status.js";
import type { StatusData } from "./index";

export const status: StatusData = statusJson as unknown as StatusData;
