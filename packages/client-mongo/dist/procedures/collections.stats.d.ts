/**
 * Procedure: mongo.collections.stats
 * Get collection statistics
 */
import { type Procedure } from "@mark1russell7/client";
import { type CollectionStats } from "../types.js";
interface StatsInput {
    [key: string]: never;
}
export declare const statsProcedure: Procedure<StatsInput, CollectionStats, {
    description: string;
}>;
export type { StatsInput };
export type StatsOutput = CollectionStats;
//# sourceMappingURL=collections.stats.d.ts.map