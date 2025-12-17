"use strict";
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures from client packages.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatOutput = exports.generateHelp = exports.parseFromSchema = exports.run = void 0;
var cli_js_1 = require("./cli.js");
Object.defineProperty(exports, "run", { enumerable: true, get: function () { return cli_js_1.run; } });
var parse_js_1 = require("./parse.js");
Object.defineProperty(exports, "parseFromSchema", { enumerable: true, get: function () { return parse_js_1.parseFromSchema; } });
Object.defineProperty(exports, "generateHelp", { enumerable: true, get: function () { return parse_js_1.generateHelp; } });
var format_js_1 = require("./format.js");
Object.defineProperty(exports, "formatOutput", { enumerable: true, get: function () { return format_js_1.formatOutput; } });
//# sourceMappingURL=index.js.map