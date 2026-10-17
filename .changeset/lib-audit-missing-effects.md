---
"@procedures/lib": minor
---

`lib.audit` reports each procedure without `metadata.effects`. A host with a capability refuses such a procedure.

- The output has the new list `procedureIssues`. Each issue has the kind `missing-effects`, the procedure path (for example `git.status`) and a message.
- The issues are warnings. They do not change `success`, so the audit step of CI does not fail for them. CI shows each one as a warning annotation.
- The audit examines the procedures of the registry of the host, as it does for `flagNotices`. It imports no package code, so its effects do not change.
- `mark` loads its registry from the built `./module` entry of each package. Thus the audit does not examine a package without a build.
