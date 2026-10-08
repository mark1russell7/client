/**
 * lib.pull as an Aggregation Definition
 *
 * Converts the 135-line imperative lib.pull to a declarative aggregation.
 *
 * Pull from remote for all packages in dependency order.
 */
import type { AggregationDefinition } from "@mark1russell7/client";
/**
 * Pull single package aggregation
 *
 * git pull with optional rebase
 */
export declare const pullSinglePackageAggregation: AggregationDefinition;
/**
 * Full lib.pull aggregation
 *
 * Pull all packages in dependency order
 */
export declare const libPullAggregation: AggregationDefinition;
//# sourceMappingURL=pull-aggregation.d.ts.map