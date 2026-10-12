# @mark1russell7/client-procedure

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

### Breaking changes (from the versions on GitHub)

- `client-procedure` does not register its own `procedure.list` and `procedure.get`. The procedures of the core answer for both. Before, the result depended on the imports of the host. The package keeps `procedure.new` and `procedure.export`.
- `procedure.get` gives `{ found: false }` for a path that has no procedure, not `null`.
