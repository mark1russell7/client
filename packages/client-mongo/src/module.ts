/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration
 *
 * Registers MongoDB procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { definePackage, type AnyProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client";

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
import { distinctProcedure } from "./procedures/documents.distinct.js";
import { bulkProcedure } from "./procedures/documents.bulk.js";
import { explainProcedure } from "./procedures/documents.explain.js";
import { watchProcedure } from "./procedures/watch.js";
import { listIndexesProcedure } from "./procedures/indexes.list.js";
import { createIndexProcedure } from "./procedures/indexes.create.js";
import { dropIndexProcedure } from "./procedures/indexes.drop.js";

/**
 * All MongoDB procedures
 */
export const procedures: readonly AnyProcedure[] = [
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
  distinctProcedure,
  bulkProcedure,
  explainProcedure,
  // Indexes
  listIndexesProcedure,
  createIndexProcedure,
  dropIndexProcedure,
  // Change streams
  watchProcedure,
];

const mongoPackage: PackageDefinition = definePackage("@procedures/mongo", [...procedures]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const mongoModule: ProcedureModule = mongoPackage.module;

export default mongoModule;

/**
 * This function registers the procedures of @procedures/mongo, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerMongoProcedures: PackageDefinition["register"] = mongoPackage.register;
