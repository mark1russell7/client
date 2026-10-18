/**
 * The overlay: a logical document read through a stack of layers, and the stacks from rules.
 */
export {
  UNSET,
  DELETED_FIELD,
  LAYER_FIELD,
  isUnset,
  mergeCopies,
  copyAsPatch,
  type MergeMode,
  type OverlayFields,
  type LayerCopy,
} from "./overlay.js";
export { resolveStacks, stackOf, type StackRule, type ResolvedStack, type LayerResolver } from "./stacks.js";
