import { describe, expect, it } from "vitest";
import { fileOf, folderOf, largestFiles, sizeByFolder } from "./module-size-plugin";

describe("folderOf", () => {
  it("gives the folder after the last node_modules, with three segments", () => {
    expect(folderOf("/w/node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/locales/de.js")).toBe("zod/v4/locales");
    expect(folderOf("C:\\w\\node_modules\\.pnpm\\zod@4.6.5\\node_modules\\zod\\v4\\core\\schemas.js")).toBe("zod/v4/core");
  });

  it("keeps four segments for a scoped package", () => {
    expect(folderOf("/w/node_modules/@mark1russell7/quantity/dist/units/length.js")).toBe("@mark1russell7/quantity/dist/units");
  });

  it("gives the folder after packages/ for a workspace package, and drops a query", () => {
    expect(folderOf("/w/packages/client/dist/procedures/core/math.js?worker")).toBe("client/dist/procedures");
    expect(folderOf("/w/packages/site/src/lib/journey.ts")).toBe("site/src/lib");
  });

  it("puts a virtual module and a file at the root in their own folders", () => {
    expect(folderOf("\0vite/preload-helper.js")).toBe("virtual");
    expect(folderOf("index.js")).toBe("(root)");
  });
});

describe("sizeByFolder", () => {
  it("adds the bytes of each folder, largest first, and a tie in the order of the names", () => {
    const sizes = sizeByFolder([
      { id: "/w/node_modules/zod/v4/core/a.js", renderedLength: 10 },
      { id: "/w/packages/site/src/lib/b.ts", renderedLength: 30 },
      { id: "/w/node_modules/zod/v4/core/c.js", renderedLength: 25 },
      { id: "/w/node_modules/zod/v4/mini/d.js", renderedLength: 30 },
    ]);
    expect(sizes).toEqual([
      { folder: "zod/v4/core", bytes: 35 },
      { folder: "site/src/lib", bytes: 30 },
      { folder: "zod/v4/mini", bytes: 30 },
    ]);
  });
});

describe("fileOf", () => {
  it("gives the folder and the file name of a module", () => {
    expect(fileOf("/w/node_modules/zod/v4/core/schemas.js")).toBe("zod/v4/core/schemas.js");
    expect(fileOf("C:\\w\\packages\\client\\dist\\procedures\\chain.js?x")).toBe("client/dist/procedures/chain.js");
  });

  it("gives a virtual module and a file at the root without a folder", () => {
    expect(fileOf("\0vite/preload-helper.js")).toBe("virtual/vite/preload-helper.js");
    expect(fileOf("/main.ts")).toBe("main.ts");
  });
});

describe("largestFiles", () => {
  it("gives the largest modules first, a tie in the order of the files, at most the count", () => {
    const files = largestFiles([
      { id: "/w/node_modules/zod/v4/core/a.js", renderedLength: 10 },
      { id: "/w/packages/site/src/lib/b.ts", renderedLength: 30 },
      { id: "/w/node_modules/zod/v4/mini/d.js", renderedLength: 30 },
    ], 2);
    expect(files).toEqual([
      { file: "site/src/lib/b.ts", bytes: 30 },
      { file: "zod/v4/mini/d.js", bytes: 30 },
    ]);
  });
});
