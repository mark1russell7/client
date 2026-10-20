/**
 * The data of the live status board (`readStatusBoard` of `@mark1russell7/site-pages`). It is a module of its own,
 * so only the code of the status page loads it (the types are in `lib/status-board.ts`).
 */

import boardJson from "./generated/status-board.js";
import type { StatusBoardData } from "../lib/status-board";

export const statusBoard: StatusBoardData = boardJson as unknown as StatusBoardData;
