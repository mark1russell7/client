// The pure core of media documents. It has no Node.js import, so it runs in a browser too.
export {
  MEDIA_STATES,
  assertMediaDocument,
  checkMediaDocument,
  isMediaId,
  isMediaType,
  isMediaUrl,
  MediaDocumentError,
  type MediaDocument,
  type MediaEntry,
  type MediaEntryBase,
  type MediaIssue,
  type MediaIssueCode,
  type MediaState,
  type MediaTable,
} from "./document.js";
export {
  DEFAULT_MAX_EMBEDDED_BYTES,
  addMedia,
  embedMedia,
  isStored,
  linkMedia,
  mediaIds,
  missingIds,
  stripMedia,
  withReceived,
  type EmbedOptions,
  type NewMedia,
  type StrippedMedia,
} from "./transfer.js";
export { addRange, isByteRange, missingRanges, normalizeRanges, planChunks, rangeBytes, type ByteRange } from "./ranges.js";
export { base64Size, decodeBase64, encodeBase64 } from "./base64.js";
