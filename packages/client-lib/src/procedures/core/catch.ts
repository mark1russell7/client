/**
 * core.catch procedure
 *
 * Wraps a procedure execution with error handling.
 * The `try` procedure ref should use `$when: "catch"` so it's not
 * executed during hydration but instead by this procedure.
 *
 * @example
 * ```typescript
 * {
 *   $proc: ["core", "catch"],
 *   input: {
 *     try: {
 *       $proc: ["git", "commit"],
 *       input: { message: "auto" },
 *       $when: "catch"  // Defer execution to catch procedure
 *     },
 *     handler: {
 *       $proc: ["core", "identity"],
 *       input: { value: { continue: true } },
 *       $when: "catch"
 *     }
 *   }
 * }
 * ```
 */

import type { ProcedureContext, ProcedurePath } from "@mark1russell7/client";
import {
  isAnyProcedureRef,
  normalizeRef,
  hydrateInput,
  type StepResultInfo,
  type ContinueDecision,
} from "@mark1russell7/client";
import type { CoreCatchInput, CoreCatchOutput } from "../../types.js";

/**
 * Execute a procedure with error handling
 */
export async function coreCatch(
  input: CoreCatchInput,
  ctx: ProcedureContext
): Promise<CoreCatchOutput> {
  const { try: tryRef, handler: handlerRef, cwd } = input;

  // Validate try is a procedure ref
  if (!isAnyProcedureRef(tryRef)) {
    throw new Error("catch: 'try' must be a procedure reference with $when: \"catch\"");
  }

  // Create executor that uses client.call
  const executor = async <TIn, TOut>(path: ProcedurePath, inp: TIn): Promise<TOut> => {
    // Inject cwd if provided
    const inputWithCwd = cwd && typeof inp === "object" && inp !== null
      ? { ...inp, cwd }
      : inp;
    return ctx.client.call(path, inputWithCwd) as Promise<TOut>;
  };

  // Normalize the try ref
  const normalizedTry = normalizeRef(tryRef);

  // Build input for try, merging with cwd
  const tryInput = {
    ...(typeof normalizedTry.input === "object" ? normalizedTry.input : {}),
    ...(cwd ? { cwd } : {}),
  };

  try {
    // Hydrate the try input (execute any nested $immediate refs). The hydration is inside the
    // `try`: a nested ref that throws is an error of the `try` step (deep dive DATA-22).
    const hydratedTryInput = await hydrateInput(tryInput, executor, {
      contextStack: ["catch"],
    });

    // Execute the try procedure
    const result = await ctx.client.call(normalizedTry.path, hydratedTryInput);

    return {
      success: true,
      result,
      continue: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If no handler, return error result with continue: false
    if (!handlerRef || !isAnyProcedureRef(handlerRef)) {
      return {
        success: false,
        error: errorMessage,
        continue: false,
      };
    }

    // Build StepResultInfo for handler
    const resultInfo: StepResultInfo = {
      success: false,
      error: errorMessage,
      proc: normalizedTry.path,
    };

    // Execute handler with result info merged into its input
    const normalizedHandler = normalizeRef(handlerRef);
    const handlerInput = {
      ...(typeof normalizedHandler.input === "object" ? normalizedHandler.input : {}),
      ...resultInfo,
      ...(cwd ? { cwd } : {}),
    };

    try {
      // Hydrate handler input (a failure here is a failure of the handler)
      const hydratedHandlerInput = await hydrateInput(handlerInput, executor, {
        contextStack: ["catch"],
      });

      const decision = await ctx.client.call(normalizedHandler.path, hydratedHandlerInput) as ContinueDecision;

      return {
        success: false,
        error: errorMessage,
        result: decision,
        continue: decision.continue ?? false,
      };
    } catch (handlerError) {
      // Handler itself failed
      return {
        success: false,
        error: `Handler failed: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`,
        continue: false,
      };
    }
  }
}
