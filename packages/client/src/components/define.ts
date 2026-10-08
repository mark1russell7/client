/**
 * Component Definition Helpers
 *
 * Utilities for defining components as procedures.
 * Components are procedures with special handling for UI rendering.
 */

import type { ZodLike } from "../client/validation/types.js";
import type { Procedure, ProcedurePath, ProcedureContext } from "../procedures/types.js";
import { PROCEDURE_REGISTRY } from "../procedures/registry.js";
import type {
  ComponentDefinition,
  ComponentContext,
  ComponentOutput,
  ComponentBundle,
  AnyComponentDefinition,
  AnyComponentFactory,
  Size,
  ComponentMetadata,
} from "./types.js";
import { isStreamingFactory } from "./types.js";

// =============================================================================
// Component Input Schema
// =============================================================================

/**
 * Standard component input structure.
 * Components receive data, size, and path for rendering.
 */
export interface ComponentInput<TData = unknown> {
  /** Component data */
  data: TData;
  /** Available size for rendering */
  size: Size;
  /** Path in render tree */
  path: string;
  /** Depth in render tree */
  depth?: number;
}

/**
 * Default component input schema.
 * Validates the standard { data, size, path } structure.
 */
export const componentInputSchema: ZodLike<ComponentInput> = {
  parse(value: unknown): ComponentInput {
    const result = this.safeParse(value);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data;
  },
  safeParse(value: unknown) {
    if (!value || typeof value !== "object") {
      return {
        success: false as const,
        error: { message: "Expected object", errors: [{ path: [], message: "Expected object" }] },
      };
    }

    const input = value as Record<string, unknown>;

    if (!("data" in input)) {
      return {
        success: false as const,
        error: { message: "Missing required field: data", errors: [{ path: ["data"], message: "Missing required field: data" }] },
      };
    }

    if (!("size" in input) || typeof input["size"] !== "object") {
      return {
        success: false as const,
        error: { message: "Missing or invalid field: size", errors: [{ path: ["size"], message: "Missing or invalid field: size" }] },
      };
    }

    const size = input["size"] as Record<string, unknown>;
    if (typeof size["width"] !== "number" || typeof size["height"] !== "number") {
      return {
        success: false as const,
        error: { message: "Size must have numeric width and height", errors: [{ path: ["size"], message: "Size must have numeric width and height" }] },
      };
    }

    if (!("path" in input) || typeof input["path"] !== "string") {
      return {
        success: false as const,
        error: { message: "Missing or invalid field: path", errors: [{ path: ["path"], message: "Missing or invalid field: path" }] },
      };
    }

    return {
      success: true as const,
      data: input as unknown as ComponentInput,
    };
  },
};

/**
 * Component output schema.
 * Validates that output is a serializable ComponentOutput.
 */
export const componentOutputSchema: ZodLike<ComponentOutput> = {
  parse(value: unknown): ComponentOutput {
    const result = this.safeParse(value);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data;
  },
  safeParse(value: unknown) {
    if (!value || typeof value !== "object") {
      return {
        success: false as const,
        error: { message: "Expected object", errors: [{ path: [], message: "Expected object" }] },
      };
    }

    const output = value as Record<string, unknown>;

    if (typeof output["type"] !== "string") {
      return {
        success: false as const,
        error: { message: "Missing or invalid field: type", errors: [{ path: ["type"], message: "Missing or invalid field: type" }] },
      };
    }

    if (!("props" in output) || typeof output["props"] !== "object") {
      return {
        success: false as const,
        error: { message: "Missing or invalid field: props", errors: [{ path: ["props"], message: "Missing or invalid field: props" }] },
      };
    }

    return {
      success: true as const,
      data: output as unknown as ComponentOutput,
    };
  },
};

// =============================================================================
// defineComponent
// =============================================================================

/**
 * Define a component and convert it to a procedure.
 *
 * Components are registered under ["components", namespace?, type].
 *
 * @param definition - Component definition
 * @returns The component definition (for chaining)
 *
 * @example
 * ```typescript
 * // Simple component
 * const userCard = defineComponent({
 *   type: "user-card",
 *   namespace: "ui",
 *   input: userSchema,
 *   factory: (ctx) => ({
 *     type: "user-card",
 *     props: { user: ctx.data },
 *   }),
 * });
 *
 * // Streaming component
 * const liveDashboard = defineComponent({
 *   type: "live-dashboard",
 *   streaming: true,
 *   factory: async function* (ctx) {
 *     yield { type: "dashboard", props: { loading: true } };
 *     for await (const data of ctx.bus.stream("updates")) {
 *       yield { type: "dashboard", props: { data } };
 *     }
 *   },
 * });
 * ```
 */
export function defineComponent<TData = unknown>(
  definition: ComponentDefinition<TData>
): ComponentDefinition<TData> {
  // Build the procedure path
  const path: ProcedurePath = definition.namespace
    ? ["components", definition.namespace, definition.type]
    : ["components", definition.type];

  // Create the procedure from the component
  const procedure = componentToProcedure(definition, path);

  // Register the procedure
  PROCEDURE_REGISTRY.register(procedure);

  return definition;
}

/**
 * Convert a component definition to a procedure.
 *
 * @param definition - Component definition
 * @param path - Procedure path
 * @returns Procedure that wraps the component
 */
export function componentToProcedure<TData>(
  definition: ComponentDefinition<TData>,
  path: ProcedurePath
): Procedure<ComponentInput<TData>, ComponentOutput> {
  const { factory, streaming, metadata } = definition;

  // Build procedure metadata
  const procedureMetadata: ComponentMetadata = {
    ...metadata,
    streaming: streaming ?? isStreamingFactory(factory),
    tags: [...(metadata?.tags ?? []), "component"],
  };

  // Create handler based on factory type
  const handler = streaming || isStreamingFactory(factory)
    ? createStreamingHandler(factory as AnyComponentFactory<TData>)
    : createStandardHandler(factory as AnyComponentFactory<TData>);

  return {
    path,
    input: definition.input
      ? createWrappedInputSchema(definition.input)
      : componentInputSchema as ZodLike<ComponentInput<TData>>,
    output: componentOutputSchema,
    metadata: procedureMetadata,
    streaming: procedureMetadata.streaming ?? false,
    handler,
  };
}

/**
 * Create a wrapped input schema that validates both structure and data.
 */
function createWrappedInputSchema<TData>(
  dataSchema: ZodLike<TData>
): ZodLike<ComponentInput<TData>> {
  return {
    parse(value: unknown): ComponentInput<TData> {
      const result = this.safeParse(value);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    safeParse(value: unknown) {
      // First validate the structure
      const structureResult = componentInputSchema.safeParse(value);
      if (!structureResult.success) {
        return structureResult;
      }

      // Then validate the data field
      const input = structureResult.data as ComponentInput<unknown>;
      const dataResult = dataSchema.safeParse(input.data);
      if (!dataResult.success) {
        return {
          success: false as const,
          error: {
            message: `Invalid data: ${dataResult.error.message}`,
            errors: dataResult.error.errors.map(e => ({ path: ["data", ...e.path], message: e.message }))
          },
        };
      }

      return {
        success: true as const,
        data: { ...input, data: dataResult.data } as ComponentInput<TData>,
      };
    },
  };
}

/**
 * Create a standard (non-streaming) handler from a component factory.
 */
function createStandardHandler<TData>(
  factory: AnyComponentFactory<TData>
): (input: ComponentInput<TData>, ctx: ProcedureContext) => Promise<ComponentOutput> {
  return async (input, ctx) => {
    const componentCtx = procedureToComponentContext(input, ctx);
    const result = factory(componentCtx);

    // Handle both sync and async returns
    if (result instanceof Promise) {
      return await result;
    }

    // Handle generator (shouldn't happen for standard, but just in case)
    if (isAsyncGenerator(result)) {
      // Take only the first yield
      const { value, done } = await result.next();
      if (done || value === undefined) {
        throw new Error("Component factory yielded no output");
      }
      return value;
    }

    return result as ComponentOutput;
  };
}

/**
 * Create a streaming handler from a component factory.
 */
function createStreamingHandler<TData>(
  factory: AnyComponentFactory<TData>
): (input: ComponentInput<TData>, ctx: ProcedureContext) => AsyncGenerator<ComponentOutput, void, unknown> {
  return async function* (input, ctx) {
    const componentCtx = procedureToComponentContext(input, ctx);
    const result = factory(componentCtx);

    if (isAsyncGenerator(result)) {
      yield* result;
    } else {
      // Convert single result to single yield
      const output = result instanceof Promise ? await result : result;
      yield output as ComponentOutput;
    }
  };
}

/**
 * Convert procedure context to component context.
 */
function procedureToComponentContext<TData>(
  input: ComponentInput<TData>,
  ctx: ProcedureContext
): ComponentContext<TData> {
  const result: ComponentContext<TData> = {
    data: input.data,
    size: input.size,
    path: input.path,
    depth: input.depth ?? 0,
    metadata: ctx.metadata,
    render: createRenderFunction(ctx),
  };
  if (ctx.bus) {
    result.bus = ctx.bus;
  }
  return result;
}

/**
 * Create a render function for child components.
 * This delegates to the procedure registry.
 */
function createRenderFunction(
  ctx: ProcedureContext
): ComponentContext["render"] {
  return async (data, size, path) => {
    // Determine component type from data
    // This is a simple heuristic - in practice, the renderer would decide
    const type = inferComponentType(data);

    if (!type) {
      // Return a passthrough if we can't determine the type
      return {
        type: "raw",
        props: { data },
      };
    }

    // Find the component procedure
    const procedure = PROCEDURE_REGISTRY.get(["components", type]);
    if (!procedure || !procedure.handler) {
      return {
        type: "unknown",
        props: { type, data },
      };
    }

    // Call the procedure
    const input: ComponentInput = {
      data,
      size,
      path,
      depth: (path.match(/\./g) || []).length,
    };

    const result = await procedure.handler(input, ctx);

    // Handle generator result
    if (isAsyncGenerator(result)) {
      const { value, done } = await result.next();
      if (done || value === undefined) {
        throw new Error("Child component yielded no output");
      }
      return value as ComponentOutput;
    }

    return result as ComponentOutput;
  };
}

/**
 * Infer component type from data.
 * This is a placeholder - real apps would use a type field or registry lookup.
 */
function inferComponentType(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check for explicit __component field
  if (typeof obj["__component"] === "string") {
    return obj["__component"];
  }

  // Check for type field
  if (typeof obj["type"] === "string") {
    return obj["type"];
  }

  return null;
}

/**
 * Check if a value is an async generator.
 */
function isAsyncGenerator(value: unknown): value is AsyncGenerator {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof (value as any).next === "function"
  );
}

// =============================================================================
// Bundle Registration
// =============================================================================

/**
 * Register a bundle of components.
 *
 * @param bundle - Component bundle
 * @returns The registered components
 *
 * @example
 * ```typescript
 * const registered = registerBundle({
 *   namespace: "ui",
 *   components: [buttonComponent, cardComponent],
 * });
 * ```
 */
export function registerBundle(bundle: ComponentBundle): AnyComponentDefinition[] {
  const registered: AnyComponentDefinition[] = [];

  for (const component of bundle.components) {
    // Apply bundle namespace if component doesn't have one
    const withNamespace: AnyComponentDefinition = {
      ...component,
      namespace: component.namespace ?? bundle.namespace,
    };

    defineComponent(withNamespace);
    registered.push(withNamespace);
  }

  return registered;
}

/**
 * Create a component bundle.
 *
 * @param namespace - Shared namespace
 * @param components - Component definitions
 * @param metadata - Optional bundle metadata
 * @returns ComponentBundle
 */
export function createBundle(
  namespace: string,
  components: AnyComponentDefinition[],
  metadata?: ComponentBundle["metadata"]
): ComponentBundle {
  const result: ComponentBundle = { namespace, components };
  if (metadata) {
    result.metadata = metadata;
  }
  return result;
}

// =============================================================================
// Quick Define Helpers
// =============================================================================

/**
 * Define a simple component with minimal boilerplate.
 *
 * @param type - Component type
 * @param factory - Factory function
 * @returns ComponentDefinition
 *
 * @example
 * ```typescript
 * const badge = simpleComponent("badge", (ctx) => ({
 *   type: "badge",
 *   props: { label: ctx.data.label },
 * }));
 * ```
 */
export function simpleComponent<TData = unknown>(
  type: string,
  factory: (ctx: ComponentContext<TData>) => ComponentOutput
): ComponentDefinition<TData> {
  return defineComponent({
    type,
    factory,
  });
}

/**
 * Define a namespaced component with minimal boilerplate.
 *
 * @param namespace - Component namespace
 * @param type - Component type
 * @param factory - Factory function
 * @returns ComponentDefinition
 */
export function namespacedComponent<TData = unknown>(
  namespace: string,
  type: string,
  factory: (ctx: ComponentContext<TData>) => ComponentOutput
): ComponentDefinition<TData> {
  return defineComponent({
    type,
    namespace,
    factory,
  });
}

/**
 * Define a streaming component.
 *
 * @param type - Component type
 * @param factory - Generator factory function
 * @returns ComponentDefinition
 */
export function streamingComponent<TData = unknown>(
  type: string,
  factory: (ctx: ComponentContext<TData>) => AsyncGenerator<ComponentOutput, void, unknown>
): ComponentDefinition<TData> {
  return defineComponent({
    type,
    streaming: true,
    factory,
  });
}
