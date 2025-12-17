"use strict";
/**
 * Output Formatting
 *
 * Formats procedure results for CLI output based on metadata hints.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatOutput = formatOutput;
/**
 * Format and print the result based on output format hint
 */
function formatOutput(print, result, format = "text") {
    if (result === undefined || result === null) {
        return;
    }
    switch (format) {
        case "json":
            print.info(JSON.stringify(result, null, 2));
            break;
        case "table":
            formatTable(print, result);
            break;
        case "text":
        case "streaming":
        default:
            formatText(print, result);
            break;
    }
}
/**
 * Format as text - handles common result shapes
 */
function formatText(print, result) {
    // String output
    if (typeof result === "string") {
        print.info(result);
        return;
    }
    // Result with output field (common pattern)
    if (isObjectWithOutput(result)) {
        print.info(result.output);
        return;
    }
    // Result with message field
    if (isObjectWithMessage(result)) {
        if (result.success === false) {
            print.error(result.message);
        }
        else {
            print.success(result.message);
        }
        return;
    }
    // Result with error field
    if (isObjectWithError(result)) {
        print.error(result.error);
        return;
    }
    // Array of items
    if (Array.isArray(result)) {
        for (const item of result) {
            formatText(print, item);
        }
        return;
    }
    // Fallback to JSON
    print.info(JSON.stringify(result, null, 2));
}
/**
 * Format as table - handles arrays of objects
 */
function formatTable(print, result) {
    // Result with rows/headers
    if (isTableResult(result)) {
        const headers = result.headers ?? Object.keys(result.rows[0] ?? {});
        const data = [headers];
        for (const row of result.rows) {
            if (Array.isArray(row)) {
                data.push(row.map(String));
            }
            else if (typeof row === "object" && row !== null) {
                data.push(headers.map((h) => String(row[h] ?? "")));
            }
        }
        print.table(data);
        return;
    }
    // Plain array of objects
    if (Array.isArray(result) && result.length > 0 && typeof result[0] === "object") {
        const headers = Object.keys(result[0]);
        const data = [headers];
        for (const row of result) {
            if (typeof row === "object" && row !== null) {
                data.push(headers.map((h) => String(row[h] ?? "")));
            }
        }
        print.table(data);
        return;
    }
    // Fallback to text
    formatText(print, result);
}
// Type guards
function isObjectWithOutput(val) {
    return (typeof val === "object" &&
        val !== null &&
        "output" in val &&
        typeof val.output === "string");
}
function isObjectWithMessage(val) {
    return (typeof val === "object" &&
        val !== null &&
        "message" in val &&
        typeof val.message === "string");
}
function isObjectWithError(val) {
    return (typeof val === "object" &&
        val !== null &&
        "error" in val &&
        typeof val.error === "string");
}
function isTableResult(val) {
    return (typeof val === "object" &&
        val !== null &&
        "rows" in val &&
        Array.isArray(val.rows));
}
//# sourceMappingURL=format.js.map