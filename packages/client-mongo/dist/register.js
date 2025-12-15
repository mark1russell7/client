/**
 * Procedure Registration
 *
 * Registers MongoDB procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { registerProcedures } from "client";
// Import all procedures
import { pingProcedure } from "./procedures/database.ping.js";
import { infoProcedure } from "./procedures/database.info.js";
import { listProcedure } from "./procedures/collections.list.js";
import { createCollectionProcedure } from "./procedures/collections.create.js";
import { dropProcedure } from "./procedures/collections.drop.js";
import { statsProcedure } from "./procedures/collections.stats.js";
import { findProcedure } from "./procedures/documents.find.js";
import { getProcedure } from "./procedures/documents.get.js";
import { insertProcedure } from "./procedures/documents.insert.js";
import { updateProcedure } from "./procedures/documents.update.js";
import { deleteProcedure } from "./procedures/documents.delete.js";
import { countProcedure } from "./procedures/documents.count.js";
import { aggregateProcedure } from "./procedures/documents.aggregate.js";
import { listIndexesProcedure } from "./procedures/indexes.list.js";
import { createIndexProcedure } from "./procedures/indexes.create.js";
import { dropIndexProcedure } from "./procedures/indexes.drop.js";
/**
 * All MongoDB procedures
 */
export const procedures = [
    // Database
    pingProcedure,
    infoProcedure,
    // Collections
    listProcedure,
    createCollectionProcedure,
    dropProcedure,
    statsProcedure,
    // Documents
    findProcedure,
    getProcedure,
    insertProcedure,
    updateProcedure,
    deleteProcedure,
    countProcedure,
    aggregateProcedure,
    // Indexes
    listIndexesProcedure,
    createIndexProcedure,
    dropIndexProcedure,
];
/**
 * Register all MongoDB procedures with the client system
 */
export function registerMongoProcedures() {
    registerProcedures([...procedures]);
}
// Auto-register when this module is loaded
registerMongoProcedures();
//# sourceMappingURL=register.js.map