// Read the input fields of the core procedures from their TypeScript source.
//
// The core procedures (packages/client/src/procedures/core) have a permissive runtime schema,
// so their JSON Schemas have no fields. Their handlers declare the input type, for example
// `handler: async (input: AddInput)`. This module reads that type with the TypeScript compiler
// API and gives the fields of each procedure: { "client.add": [{ name: "a", type: "number", optional: false }] }.

import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export function readCoreFields(packagesDir) {
  const coreDir = join(packagesDir, "client", "src", "procedures", "core");
  const require = createRequire(join(packagesDir, "client", "package.json"));
  const ts = require("typescript");

  const files = readdirSync(coreDir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(coreDir, name));
  const program = ts.createProgram(files, { strict: true, target: ts.ScriptTarget.ESNext, noEmit: true });
  const checker = program.getTypeChecker();
  const fields = {};

  const propertyOf = (object, name) =>
    object.properties.find(
      (property) => ts.isPropertyAssignment(property) && property.name.getText() === name,
    );

  // `const x: XProcedure = defineProcedure(...)` with `type XProcedure = Procedure<XInput, ...>`
  function declaredInputTypeNode(call) {
    const declaration = call.parent;
    if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.type) return undefined;
    let typeNode = declaration.type;
    if (ts.isTypeReferenceNode(typeNode) && !typeNode.typeArguments) {
      const alias = checker.getSymbolAtLocation(typeNode.typeName)?.declarations?.[0];
      if (alias && ts.isTypeAliasDeclaration(alias)) typeNode = alias.type;
    }
    return ts.isTypeReferenceNode(typeNode) ? typeNode.typeArguments?.[0] : undefined;
  }

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "defineProcedure" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const definition = node.arguments[0];
      const path = propertyOf(definition, "path");
      const handler = propertyOf(definition, "handler");
      if (path && ts.isArrayLiteralExpression(path.initializer)) {
        const key = ["client", ...path.initializer.elements.map((element) => element.text)].join(".");
        const fn = handler?.initializer;
        const parameter = fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ? fn.parameters[0] : undefined;
        // The input type: the handler's annotation, else the first type argument of the declared
        // `Procedure<TInput, ...>` type (for a handler that is defined elsewhere, as the logic procedures)
        const inputTypeNode = parameter?.type ?? declaredInputTypeNode(node);
        if (inputTypeNode) {
          const type = checker.getTypeFromTypeNode(inputTypeNode);
          fields[key] = checker.getPropertiesOfType(type).map((symbol) => ({
            name: symbol.getName(),
            type: checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, inputTypeNode)).replace(/ \| undefined$/, ""),
            optional: (symbol.getFlags() & ts.SymbolFlags.Optional) !== 0,
          }));
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (source) visit(source);
  }
  return fields;
}
