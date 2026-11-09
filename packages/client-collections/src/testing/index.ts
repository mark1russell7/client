/**
 * `@procedures/collections/testing`: the test-only entry of this package.
 *
 * This entry holds the contract suite of `CollectionStorage`. A storage package runs it in its
 * tests with a factory of its storage. The entry imports no test framework: the caller gives
 * `describe` and `it`. The runtime entries of the package do not import this entry.
 */

export {
  collectionStorageContract,
  contractVersionOf,
  describeCollectionStorageContract,
  type CollectionStorageContractOptions,
  type ContractCase,
  type ContractItem,
  type ContractStorage,
  type ContractTestApi,
  type ContractTestContext,
} from "./storage-contract.js";
export {
  /**
   * @deprecated A later MINOR removes this name. The checks of the suite then throw the `AssertionError` of
   * `node:assert`.
   */
  ContractViolation,
  /** @deprecated A later MINOR removes this name. Use `isDeepStrictEqual` of `node:util`. */
  deepEqual,
} from "@mark1russell7/collections/testing";
