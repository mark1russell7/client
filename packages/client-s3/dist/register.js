/**
 * Procedure Registration for S3 operations
 *
 * Provides s3.upload, s3.download, s3.list, s3.delete, and s3.multipart.* procedures.
 * Credentials are loaded from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
 */
import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
import { s3Upload, s3Download, s3List, s3ListAll, s3Delete, s3MultipartInit, s3MultipartUpload, s3MultipartComplete, s3MultipartAbort, } from "./procedures/s3/index.js";
import { S3UploadInputSchema, S3DownloadInputSchema, S3ListInputSchema, S3ListAllInputSchema, S3DeleteInputSchema, S3MultipartInitInputSchema, S3MultipartUploadInputSchema, S3MultipartCompleteInputSchema, S3MultipartAbortInputSchema, } from "./types.js";
// =============================================================================
// Procedures
// =============================================================================
const s3UploadProcedure = createProcedure()
    .path(["s3", "upload"])
    .input(zodAdapter(S3UploadInputSchema))
    .output(outputSchema())
    .meta({
    description: "Upload content to S3 bucket",
    shorts: { bucket: "b", key: "k" },
    output: "json",
})
    .handler(async (input) => {
    return s3Upload(input);
})
    .build();
const s3DownloadProcedure = createProcedure()
    .path(["s3", "download"])
    .input(zodAdapter(S3DownloadInputSchema))
    .output(outputSchema())
    .meta({
    description: "Download content from S3 bucket",
    shorts: { bucket: "b", key: "k", encoding: "e" },
    output: "json",
})
    .handler(async (input) => {
    return s3Download(input);
})
    .build();
const s3ListProcedure = createProcedure()
    .path(["s3", "list"])
    .input(zodAdapter(S3ListInputSchema))
    .output(outputSchema())
    .meta({
    description: "List objects in S3 bucket",
    shorts: { bucket: "b", prefix: "p", maxKeys: "n" },
    output: "json",
})
    .handler(async (input) => {
    return s3List(input);
})
    .build();
const s3ListAllProcedure = createProcedure()
    .path(["s3", "listAll"])
    .input(zodAdapter(S3ListAllInputSchema))
    .output(outputSchema())
    .meta({
    description: "List ALL objects in S3 bucket, following continuation tokens (unbounded by 1000)",
    shorts: { bucket: "b", prefix: "p", maxKeys: "n" },
    output: "json",
})
    .handler(async (input) => {
    return s3ListAll(input);
})
    .build();
const s3DeleteProcedure = createProcedure()
    .path(["s3", "delete"])
    .input(zodAdapter(S3DeleteInputSchema))
    .output(outputSchema())
    .meta({
    description: "Delete object from S3 bucket",
    shorts: { bucket: "b", key: "k" },
    output: "json",
})
    .handler(async (input) => {
    return s3Delete(input);
})
    .build();
const s3MultipartInitProcedure = createProcedure()
    .path(["s3", "multipart", "init"])
    .input(zodAdapter(S3MultipartInitInputSchema))
    .output(outputSchema())
    .meta({
    description: "Initialize multipart upload for large files",
    shorts: { bucket: "b", key: "k" },
    output: "json",
})
    .handler(async (input) => {
    return s3MultipartInit(input);
})
    .build();
const s3MultipartUploadProcedure = createProcedure()
    .path(["s3", "multipart", "upload"])
    .input(zodAdapter(S3MultipartUploadInputSchema))
    .output(outputSchema())
    .meta({
    description: "Upload a part in multipart upload",
    shorts: { bucket: "b", key: "k", partNumber: "n" },
    output: "json",
})
    .handler(async (input) => {
    return s3MultipartUpload(input);
})
    .build();
const s3MultipartCompleteProcedure = createProcedure()
    .path(["s3", "multipart", "complete"])
    .input(zodAdapter(S3MultipartCompleteInputSchema))
    .output(outputSchema())
    .meta({
    description: "Complete multipart upload by assembling parts",
    shorts: { bucket: "b", key: "k" },
    output: "json",
})
    .handler(async (input) => {
    return s3MultipartComplete(input);
})
    .build();
const s3MultipartAbortProcedure = createProcedure()
    .path(["s3", "multipart", "abort"])
    .input(zodAdapter(S3MultipartAbortInputSchema))
    .output(outputSchema())
    .meta({
    description: "Abort multipart upload and clean up parts",
    shorts: { bucket: "b", key: "k" },
    output: "json",
})
    .handler(async (input) => {
    return s3MultipartAbort(input);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerS3Procedures() {
    registerProcedures([
        s3UploadProcedure,
        s3DownloadProcedure,
        s3ListProcedure,
        s3ListAllProcedure,
        s3DeleteProcedure,
        s3MultipartInitProcedure,
        s3MultipartUploadProcedure,
        s3MultipartCompleteProcedure,
        s3MultipartAbortProcedure,
    ]);
}
// Auto-register
registerS3Procedures();
//# sourceMappingURL=register.js.map