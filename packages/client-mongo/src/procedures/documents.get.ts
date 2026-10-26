/**
 * Procedure: mongo.documents.get
 * Get a single document by ID
 */

import {
  createProcedure,
  type Effects,
  type Procedure,
  type ProcedureContext,
} from "@procedures/client";
import { collectionFor, copyScope, type ScopeInput } from "../scope.js";
import { described, idTypeField, scopeFields } from "./input-schemas.js";
import { z } from "zod";
import {
  buildIdFilter,
  type IdType,
  type MongoDocument,
} from "../types.js";

// Input/Output types
interface GetInput extends ScopeInput {
  id: string;
  /** How to interpret the id (default: "auto" — matches ObjectId or string) */
  idType?: IdType;
}

interface GetOutput {
  document: MongoDocument | null;
}

/**
 * Validate get input: `id` must be a non-empty string, and `idType`, when
 * present, must be one of the supported modes.
 */
function parseGetInput(data: unknown): GetInput {
  if (typeof data !== "object" || data === null) {
    throw new Error("mongo.documents.get: input must be an object");
  }
  const raw = data as Record<string, unknown>;

  const id = raw["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("mongo.documents.get: id must be a non-empty string");
  }

  const result: GetInput = { id };
  copyScope(raw, result);

  const idType = raw["idType"];
  if (idType !== undefined) {
    if (idType !== "auto" && idType !== "objectId" && idType !== "string") {
      throw new Error(
        'mongo.documents.get: idType must be "auto", "objectId", or "string"'
      );
    }
    result.idType = idType;
  }

  return result;
}

// Schemas
const getInputSchema = described<GetInput>(
  parseGetInput,
  z.object({
    ...scopeFields(),
    id: z.string().min(1).describe("The id of the document"),
    idType: idTypeField(),
  })
);
const getOutputSchema: z.ZodType<GetOutput> = z.looseObject({
    document: z.record(z.string(), z.unknown()).nullable().describe("The document, or null when no document has the id"),
  });

export const getProcedure: Procedure<
  GetInput,
  GetOutput,
  { description: string; effects?: Effects }
> = createProcedure()
  .path(["mongo", "documents", "get"])
  .input(getInputSchema)
  .output(getOutputSchema)
  .meta({
    description: "Get a single document by ID",
    effects: { reads: ["mongo", "network"], writes: [] },
  })
  .handler(async (input: GetInput, ctx: ProcedureContext) => {
    const { collection } = await collectionFor(input, ctx);

    const document = await collection.findOne(
      buildIdFilter(input.id, input.idType)
    );

    return { document };
  })
  .build();

export type { GetInput, GetOutput };
