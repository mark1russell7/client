/**
 * lib.install as an Aggregation Definition
 *
 * Converts the 231-line imperative lib.install to a declarative aggregation.
 *
 * Steps:
 * 1. Load ecosystem manifest
 * 2. Clone missing packages
 * 3. Scan and build DAG
 * 4. Install and build in DAG order
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * Clone missing package aggregation
 *
 * Checks if package exists, clones if not
 */
export declare const cloneMissingPackageAggregation: AggregationDefinition;
/**
 * Install single package aggregation
 *
 * pnpm install → pnpm run build
 */
export declare const installSinglePackageAggregation: AggregationDefinition;
/**
 * Full lib.install aggregation
 *
 * Installs entire ecosystem:
 * 1. Load manifest
 * 2. Clone missing packages
 * 3. Install/build in DAG order
 */
export declare const libInstallAggregation: AggregationDefinition;
//# sourceMappingURL=install-aggregation.d.ts.map