/**
 * The entry point "@procedures/client/testing" (roadmap CLI-85): the transport contract, for the
 * test files of each face of the procedures server. A face in another package, or the server of
 * an app, runs the same cases as the faces of this package. `WIRE-PROTOCOL.md` is the contract.
 *
 * It imports no test runner: the caller gives the functions of its runner (`ContractRunner`).
 */

export {
  CONTRACT_COLLECTION,
  CONTRACT_PATHS,
  CONTRACT_PRINCIPAL,
  CONTRACT_TOKEN,
  clientCaller,
  contractDescription,
  describeTransportContract,
} from "./transport-contract.js";
export type {
  ContractCallOptions,
  ContractCaller,
  ContractCapabilities,
  ContractCase,
  ContractExpectation,
  ContractFace,
  ContractRunner,
  ContractServer,
  ContractSpec,
} from "./transport-contract.js";
export { mcpCaller } from "./mcp-caller.js";
export type { McpClientLike } from "./mcp-caller.js";
export { LogStorage } from "./log-storage.js";
