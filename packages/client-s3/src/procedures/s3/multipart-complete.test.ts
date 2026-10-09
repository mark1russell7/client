import { describe, it, expect, vi } from "vitest";

// A fake S3 client that records the input of each command
const sent: Array<Record<string, unknown>> = [];
vi.mock("../../s3-client.js", () => ({
  getS3Client: () => ({
    send: async (command: { input: Record<string, unknown> }) => {
      sent.push(command.input);
      return { ETag: '"done"' };
    },
  }),
}));

const { s3MultipartComplete } = await import("./multipart-complete.js");

describe("s3.multipart.complete", () => {
  it("sends the parts in the order of their numbers", async () => {
    await s3MultipartComplete({
      bucket: "b",
      key: "k",
      uploadId: "u",
      parts: [
        { partNumber: 3, etag: "c" },
        { partNumber: 1, etag: "a" },
        { partNumber: 2, etag: "b" },
      ],
    });

    const upload = sent[0]!["MultipartUpload"] as { Parts: Array<{ PartNumber: number; ETag: string }> };
    expect(upload.Parts.map((part) => part.PartNumber)).toEqual([1, 2, 3]);
    expect(upload.Parts.map((part) => part.ETag)).toEqual(['"a"', '"b"', '"c"']);
  });
});
