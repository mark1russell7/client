/**
 * The entry `@procedures/dag/graph` holds pure graph functions. It imports no other package, so a browser bundle or a
 * general package can use it without `@procedures/client` and zod.
 */

export { hubBreadthFirstOrder, type WeightedEdge } from "./hub-order.js";
