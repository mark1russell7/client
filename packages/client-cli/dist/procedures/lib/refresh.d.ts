/**
 * lib.refresh procedure
 *
 * Refreshes a library by:
 * 1. rm -rf node_modules/, dist/, pnpm-lock.yaml
 * 2. pnpm install
 * 3. pnpm run build
 * 4. git add -A && git commit && git push
 *
 * With --recursive, processes dependencies in post-order (bottom-up).
 */
import type { LibRefreshInput, LibRefreshOutput } from "../../types.js";
/**
 * Refresh a package and optionally its dependencies recursively
 */
export declare function libRefresh(input: LibRefreshInput): Promise<LibRefreshOutput>;
//# sourceMappingURL=refresh.d.ts.map