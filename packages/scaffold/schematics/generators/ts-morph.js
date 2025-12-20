/**
 * ts-morph Generators
 *
 * AST-based TypeScript file generation using ts-morph.
 */
import { Project } from "ts-morph";
/**
 * Generate vitest.config.ts
 */
export const generateVitestConfig = async (_path, _context) => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("vitest.config.ts");
    // Import defineConfig from vitest/config
    sourceFile.addImportDeclaration({
        moduleSpecifier: "vitest/config",
        namedImports: ["defineConfig"],
    });
    // Import sharedConfig from @mark1russell7/test
    sourceFile.addImportDeclaration({
        moduleSpecifier: "@mark1russell7/test",
        namedImports: ["sharedConfig"],
    });
    // Export default config
    sourceFile.addStatements(`
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ["src/**/*.test.ts"],
  },
});
`);
    return sourceFile.getFullText();
};
/**
 * Generate src/index.ts entry point
 */
export const generateIndexTs = async (_path, context) => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("index.ts");
    // Add header comment
    sourceFile.addStatements(`/**
 * ${context.fullPackageName}
 *
 * @packageDocumentation
 */

// Entry point
export {};
`);
    return sourceFile.getFullText();
};
/**
 * Generate a basic test file
 */
export const generateTestFile = async (path, context) => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(path);
    // Import vitest
    sourceFile.addImportDeclaration({
        moduleSpecifier: "vitest",
        namedImports: ["describe", "it", "expect"],
    });
    // Add basic test
    sourceFile.addStatements(`
describe("${context.packageName}", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});
`);
    return sourceFile.getFullText();
};
/**
 * Generate register.ts for procedure packages
 */
export const generateRegisterTs = async (_path, _context) => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("register.ts");
    // Import from client
    sourceFile.addImportDeclaration({
        moduleSpecifier: "@mark1russell7/client",
        namedImports: ["registerProcedures"],
    });
    // Export empty registration
    sourceFile.addStatements(`
// Register procedures here
registerProcedures([]);
`);
    return sourceFile.getFullText();
};
//# sourceMappingURL=ts-morph.js.map