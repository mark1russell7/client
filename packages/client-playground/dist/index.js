/**
 * Client Playground
 *
 * Type-safe aggregation building for procedure compositions.
 * Write aggregations in TypeScript with full autocomplete, then run them.
 *
 * @example
 * ```typescript
 * // my-agg.play.ts
 * import { proc, ref, run } from "@mark1russell7/client-playground";
 *
 * run(
 *   proc(["dag", "traverse"]).input({
 *     visit: [
 *       proc(["pnpm", "install"]).ref,
 *       proc(["git", "hasChanges"]).name("changes").ref,
 *       proc(["client", "conditional"]).input({
 *         condition: ref("changes.value"),
 *         then: proc(["git", "add"]).input({ all: true }).ref,
 *       }).ref,
 *     ],
 *   }).ref
 * );
 * ```
 *
 * Run with: `npx tsx my-agg.play.ts`
 */
/**
 * Create an output reference.
 *
 * @param path - Reference path (e.g., "stageName.value" or "$last.value")
 * @returns Output reference object
 *
 * @example
 * ```typescript
 * ref("changes.value")     // Reference the .value field of "changes" output
 * ref("$last")             // Reference the previous step's output
 * ref("$last.success")     // Reference the .success field of previous output
 * ```
 */
export function ref(path) {
    return { $ref: path };
}
/**
 * Create a procedure reference builder.
 *
 * @param path - Path to the procedure (e.g., ["git", "add"])
 * @returns Builder for the procedure reference
 *
 * @example
 * ```typescript
 * // Simple reference
 * proc(["git", "add"]).input({ all: true }).ref
 *
 * // Named reference for $ref
 * proc(["git", "hasChanges"]).name("changes").ref
 *
 * // With execution timing
 * proc(["git", "add"]).input({ all: true }).when("$parent").ref
 * ```
 */
export function proc(path) {
    let _input = {};
    let _name;
    let _when;
    const builder = {
        input(input) {
            _input = input;
            return builder;
        },
        name(name) {
            _name = name;
            return builder;
        },
        when(when) {
            _when = when;
            return builder;
        },
        get ref() {
            const result = {
                $proc: path,
                input: _input,
            };
            if (_name) {
                result.$name = _name;
            }
            if (_when) {
                result.$when = _when;
            }
            return result;
        },
    };
    return builder;
}
/**
 * Run a procedure reference.
 *
 * This function executes the procedure and prints the result.
 * Use this in your playground files to execute aggregations.
 *
 * @param procedureRef - The procedure reference to execute
 * @param options - Execution options
 * @returns The result of the procedure
 *
 * @example
 * ```typescript
 * // Run and print result
 * await run(proc(["git", "status"]).ref);
 *
 * // Run without printing
 * const result = await run(proc(["git", "status"]).ref, { print: false });
 * ```
 */
export async function run(procedureRef, options = {}) {
    const { print: shouldPrint = true, format = "json" } = options;
    // Dynamic import to avoid bundling all of client
    const { Client, LocalTransport, PROCEDURE_REGISTRY } = await import("@mark1russell7/client");
    // Create client with local transport
    const transport = new LocalTransport();
    // Sync registry to transport
    for (const procedure of PROCEDURE_REGISTRY.getAll()) {
        if (procedure.handler) {
            const [service, ...rest] = procedure.path;
            const method = { service: service, operation: rest.join(".") };
            transport.register(method, async (payload) => {
                const context = {
                    metadata: {},
                    path: procedure.path,
                    client: {
                        call: async (p, i) => {
                            const proc = PROCEDURE_REGISTRY.get(p);
                            if (!proc?.handler) {
                                throw new Error(`Procedure not found: ${p.join(".")}`);
                            }
                            return proc.handler(i, context);
                        },
                    },
                };
                return procedure.handler(payload, context);
            });
        }
    }
    const client = new Client({ transport });
    // Execute the procedure
    const result = await client.exec(procedureRef);
    // Print result
    if (shouldPrint) {
        if (format === "json") {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            console.log(result);
        }
    }
    return result;
}
//# sourceMappingURL=index.js.map