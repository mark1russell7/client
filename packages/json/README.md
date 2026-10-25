# @procedures/json

[![npm](https://img.shields.io/npm/v/@procedures/json?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/json)

```sh
npm install @procedures/json
```

Transforms of JSON values as procedures: a query, a patch, a diff, a merge and a schema check. Other procedures change YAML and CSV to JSON and back. Each procedure is pure. Its output comes only from its input, and it changes nothing.

## The procedures

| Procedure | What it does |
|---|---|
| `json.query` | It gives the values at a JSON Pointer (RFC 6901) or at a path query. |
| `json.patch` | It applies a JSON Patch (RFC 6902). |
| `json.diff` | It gives the JSON Patch that changes one value into another value. |
| `json.merge` | It applies a JSON merge patch (RFC 7386). |
| `json.validate` | It examines a value against a JSON Schema. |
| `yaml.parse` | It parses YAML text into a JSON value. |
| `yaml.stringify` | It writes a JSON value as YAML text. |
| `csv.parse` | It parses CSV text into rows: arrays of fields, or objects with a header. |
| `csv.stringify` | It writes rows as CSV text. |

Each procedure declares `PURE_EFFECTS`, so a read-only host can start it. The MCP server of `@procedures/bundle-mcp` does not show the `csv` procedures as tools.

```ts
import "@procedures/json/register";

await client.call(["json", "query"], { value: config, path: "services[*].image" });
await client.call(["json", "patch"], { value: config, patch: [{ op: "replace", path: "/version", value: 2 }] });
await client.call(["yaml", "parse"], { text: "name: app\nports: [80, 443]" });
```

## Pointers and paths

`json.query` takes `pointer` or `path`. Each match has its JSON Pointer.

| Path | Meaning |
|---|---|
| `$` | The whole value. It is optional at the start. |
| `.name` or `name` | A member of an object. A name has letters, digits, `_`, `$` and `-`. |
| `["a.b"]` | A member with any key. A backslash escapes a quote or a backslash. |
| `[2]`, `[-1]` | An item of an array. `[-1]` is the last item. |
| `*` or `[*]` | Each member or each item. |
| `..name` | The same step at each depth. |

The path query has no filters and no scripts.

## The prototype keys

A pointer, a path, a JSON Patch and a merge patch cannot name `__proto__`, `constructor` or `prototype`. The error has the code `PROTOTYPE_KEY`.

- A key `__proto__` in the data stays data. Each object that a procedure makes has own data properties only.
- The patch of `json.diff` does not name a prototype key. When a difference is under such a key, the patch replaces the object that holds the key.

## Patches

- `json.patch` applies all operations or none. A failed `test` operation gives the code `TEST_FAILED`.
- `json.diff` keeps the shared start and end of an array, so an insert at the start is one `add`.
- `json.patch` of the output of `json.diff` on the first value gives the second value. A property test with random JSON values examines this rule.
- `json.merge` removes a key whose patch value is null. A patch that is not an object replaces the value.

## The schema check

`json.validate` uses the validator of [`@procedures/compiler`](../compiler), the validator that `program.check` uses. It examines a subset of JSON Schema:

- `type`, `enum`, `const` and `$ref` to the same schema
- `allOf`, `anyOf` and `oneOf`. The check examines `oneOf` as `anyOf`, so a value that agrees with two branches passes.
- `properties`, `required`, `additionalProperties` and `patternProperties`
- `items`, `prefixItems`, `additionalItems`, `minItems` and `maxItems`
- `minLength`, `maxLength` and `pattern`. The lengths count UTF-16 code units.
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` and `multipleOf`

The check ignores `format` and the other annotations, as the standard tells. The output field `unchecked` lists each keyword of the schema that the check does not examine. Examples are `not`, `if`, `uniqueItems`, `minProperties` and a `$ref` to another document. When `unchecked` is empty, the verdict is complete. A `oneOf` in the schema goes into `unchecked` too, because its check is not complete.

## YAML

- The parse uses YAML 1.2 with the core schema of the [`yaml`](https://www.npmjs.com/package/yaml) package.
- The parse gives only JSON values. `.inf` and `.nan` are errors. A map or a list as a key is an error.
- A key that is a number, a boolean or null becomes its text.
- The explicit YAML 1.1 tags (`!!binary`, `!!timestamp`) give their text.
- The parse refuses more than 100 aliases, because many aliases can fill the memory. It also refuses a duplicate key.
- `all: true` reads more than one document and gives the list of documents.
- The text of `yaml.stringify` is YAML 1.2, and a YAML 1.1 reader reads the same value. A string that YAML 1.1 reads as another type is in double quotes, for example `yes`, `no`, `on`, a date or `0777`.
- `yaml.parse` of the text of `yaml.stringify` gives the value again. A property test with random JSON values examines this rule.
- A strict YAML 1.1 reader reads a number with an exponent and without a fraction as a string, for example `1e+21`.

## CSV

The functions `parseCsv(text, options)` and `stringifyCsv(rows, options)` read and write CSV text (RFC 4180). The procedures `csv.parse` and `csv.stringify` use them.

```ts
import { parseCsv, stringifyCsv } from "@procedures/json";

parseCsv('date,note\n2026-10-01,"Shop ""A"", Main St"\n', { header: true });
// [{ date: "2026-10-01", note: 'Shop "A", Main St' }]

stringifyCsv([{ date: "2026-10-01", amount: -4.5 }]);
// "date,amount\r\n2026-10-01,-4.5\r\n"
```

The entry `@procedures/json/csv` exports the same CSV functions and types, and `JsonError`. Its imports reach no other package, so a program that only reads CSV starts faster.

The parse:

- A field in double quotes can have the delimiter, a line break and a quote. Two quotes (`""`) in the field give one quote.
- A line break is CRLF, LF or CR. A line break at the end of the text does not start a row.
- The parse removes a byte order mark at the start of the text.
- A quote in a field without quotes is a normal character.
- The parse skips each empty line. With `skipEmptyLines: false`, an empty line gives a row with one empty field.
- `delimiter` sets the character between two fields, for example `;` or a tab. The default is a comma.
- With `trim: true`, the parse removes the white space at the start and at the end of each field, also in quotes.
- With `header: true`, the first row gives the names of the columns, and each other row is an object.
- A row with fewer fields than the header gets empty text for the missing columns. A row with more fields is an error.
- A column `__proto__` stays data in the object.

The text of `stringifyCsv`:

- The rows are all arrays or all objects. A field is a string, a finite number, a boolean or null. Null gives an empty field.
- A field gets quotes only when it has the delimiter, a quote or a line break.
- For objects, the first row has the names of the columns. The default columns are the keys, in the order that the rows first give them.
- `columns` selects the keys and gives their order. For arrays, `columns` is the first row. `header: false` removes the row of names.
- Each row ends with CRLF, as RFC 4180 tells. `lineBreak: "\n"` writes LF.
- `parseCsv` of the text gives the rows again, with the same `delimiter`. A property test with random rows examines this rule.

## Errors

Each error is a `JsonError`. A server sends it with its code and its message, and HTTP gives it the status 500. The field `code` tells the kind:

| Code | Cause |
|---|---|
| `NOT_JSON` | A value is not JSON: `undefined`, `NaN`, a date or a value that refers to itself. The message has the pointer of the value. |
| `INVALID_POINTER` | A pointer or a path is not correct. |
| `PROTOTYPE_KEY` | A pointer, a path or a patch names a prototype key. |
| `INVALID_PATCH` | An operation is not correct, or its location does not exist. |
| `TEST_FAILED` | A `test` operation found another value. |
| `INVALID_YAML` | The YAML text is not correct, or it has a value that JSON does not have. |
| `INVALID_SCHEMA` | The schema is not an object or a boolean. |
| `INVALID_CSV` | The CSV text is not correct, for example a quote without its closing quote. A row, a field or a delimiter of the writer is not correct. The message tells the line or the row. |

## Related packages

- [`@procedures/client`](../client): the core, with `PURE_EFFECTS`.
- [`@procedures/compiler`](../compiler): the validator of the schema check.
- [`@procedures/http`](../http): the HTTP procedures.
