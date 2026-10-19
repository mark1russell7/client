# @procedures/access

[![npm](https://img.shields.io/npm/v/@procedures/access?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/access)

```sh
npm install @procedures/access @procedures/client
```

The rights of a principal on a scope: access lists, owners, rights that imply other rights, and conditions over the document of a check. The rules of the app are a policy. The package has no procedures, and the package root registers nothing.

## The engine

A scope is a name of the app, for example `space`, `board:b1` or `user:u1`. A scope can have an access list:

```ts
const list = {
  owner: "user:u_mark",
  access: [
    { principal: "group:core", rights: ["write"] },
    { principal: "email:zoe@example.com", rights: ["read"] },
    { principal: "signed-in", rights: ["write"], when: { $eq: ["$$doc.by", "$$principal.user"] } },
  ],
};
```

| Principal | Who |
| --- | --- |
| `user:<id>` | One user |
| `email:<address>` | The user with this verified email. The case of the letters does not matter. |
| `group:<id>` | Each member of the group |
| `signed-in` | Each signed-in user |
| `anyone` | Each request, also without a user |

- The owner has each right. The owner names one user, one email or one group.
- The default rights are `read`, `write`, `share` and `admin`. `admin` implies `share` and `write`, and each of them implies `read`. The policy can give another model.
- An entry with `when` gives its rights only where the evaluator of the policy gives exactly `true` for that document. An error is false. The variables are `principal` (`user`, `email`, `groups`, `signedIn`), `doc`, `prev` and `op`.
- An agent without a user (a service account) has each right. An agent that acts for a user has the rights of that user.

## The policy of the app

```ts
import { Access, DEFAULT_RIGHTS } from "@procedures/access";

const access = new Access({
  // The owner of a personal scope has each right, before its list
  implicit: (scope, subject) => (subject.user && scope === `user:${subject.user}` ? DEFAULT_RIGHTS.all : undefined),
  // A board without a list follows the space
  parent: (scope) => (scope.startsWith("board:") ? "space" : undefined),
  // The space without a list: the signed-in users read
  fallback: (scope, subject) => (scope === "space" && subject.user ? ["read"] : []),
  // The conditions use an expression language of the app
  evaluate: (condition, variables) => evaluateExpression(condition, variables) === true,
});

access.can("write", "board:b1", subject, lists, { op: "write", doc, prev });
```

| Hook | What it gives |
| --- | --- |
| `implicit(scope, subject)` | The rights before the list. A defined result is final. |
| `parent(scope)` | The scope whose rights a scope without a list takes |
| `fallback(scope, subject)` | The rights of a scope without a list and without a parent. The default is none. |
| `names(principal, subject)` | More principal names of the app, for example `link` for anyone |
| `superuser(subject)` | A subject with each right. The default is an agent without a user. |
| `evaluate(condition, variables)` | The value of a `when` condition |

- `conditionalOn(right, scope, subject, lists)` tells if a conditional entry can give the right on some documents. Then check each document with its context.
- `readable(scopes, subject, lists)` gives the scopes that the subject can read.
- `asAccessList(raw)` checks a stored list, and keeps only its known fields.

## The principal of a request

`subjectOf(principal)` reads the principal of the request hook (`ctx.principal`). Its `via` decides, and its id does not:

- `anonymous`: no user.
- `agent-token` and the host token `token`: a service account.
- Each other `via`: the user of the id. The claims give `email`, `groups` and `agent`.

A refused request has no principal, and its subject is anonymous.

`accessAdmitItem` gives the output filter of a host (`admitItem`). It admits an item when the subject can read the scope of the item:

```ts
const server = createProcedureServer({
  admitItem: accessAdmitItem({ access, lists: () => listsOfTheTenant(), scopeOf: (item) => item._scope ?? "space" }),
});
```

- An item without a scope is refused.
- A conditional entry sees the item as `doc`.
- The option `docOf` gives the document of an item for a `when` condition. The default is the item itself.

## The rows of a collection

The option `admission` of `createCollectionProcedures()` takes a rule of the rows and a guard of the writes (roadmap CLI-41). `accessAdmitItem` gives the rule, and `accessWriteGuard` gives the guard:

```ts
const lists = () => listsOfTheTenant();
const procedures = createCollectionProcedures("notes", {
  admission: {
    // Each read gives only the rows that the subject can read
    admit: accessAdmitItem({ access, lists, scopeOf: (row) => row.value._scope ?? "space", docOf: (row) => row.value }),
    // Each set, patch and delete needs the right `write`
    guard: accessWriteGuard({ access, lists, scopeOf: (doc) => doc._scope ?? "space" }),
  },
});
```

- The rule gets each row `{ id, value }`. Thus `scopeOf` and `docOf` read `row.value`.
- The guard gets the stored document (`prev`) and the new document (`doc`). Its `scopeOf` reads a document.
- A `when` condition of the guard gets `op`: `write` for a `set` and a `patch`, and `delete` for a `delete`.
- A write that moves a document to another scope needs the right on the two scopes. A write with no document is refused.
