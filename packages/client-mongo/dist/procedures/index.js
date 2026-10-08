/**
 * Procedure Barrel Export
 */
// Database procedures
export { pingProcedure } from "./database.ping.js";
export { infoProcedure } from "./database.info.js";
// Collection procedures
export { listProcedure } from "./collections.list.js";
export { createCollectionProcedure } from "./collections.create.js";
export { dropProcedure } from "./collections.drop.js";
export { statsProcedure } from "./collections.stats.js";
// Document procedures
export { findProcedure } from "./documents.find.js";
export { getProcedure } from "./documents.get.js";
export { insertProcedure } from "./documents.insert.js";
export { updateProcedure } from "./documents.update.js";
export { deleteProcedure } from "./documents.delete.js";
export { countProcedure } from "./documents.count.js";
export { aggregateProcedure } from "./documents.aggregate.js";
// Index procedures
export { listIndexesProcedure } from "./indexes.list.js";
export { createIndexProcedure } from "./indexes.create.js";
export { dropIndexProcedure } from "./indexes.drop.js";
// Schema helper
export { schema } from "./schema.js";
//# sourceMappingURL=index.js.map