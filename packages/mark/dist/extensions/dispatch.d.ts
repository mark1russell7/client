/**
 * Dispatch Extension
 *
 * Adds procedure dispatch capability to the Gluegun toolbox.
 */
import type { GluegunToolbox } from "gluegun";
import "@mark1russell7/client-cli";
import "@mark1russell7/client-logger";
declare module "gluegun" {
    interface GluegunToolbox {
        dispatch: {
            call: <TInput, TOutput>(path: string[], input: TInput) => Promise<TOutput>;
            sessionId: string;
        };
    }
}
/**
 * Add dispatch extension to toolbox
 */
declare const _default: (toolbox: GluegunToolbox) => void;
export default _default;
//# sourceMappingURL=dispatch.d.ts.map