---
name: node-version-mismatch
description: "Use when a command fails with a Node engine/version error — EBADDEVENGINES, \"Unsupported engine\", \"engine is incompatible\", or similar — in a repo that has an .nvmrc."
---

1. **Confirm the mismatch.** Compare `node -v` against `.nvmrc` at the repo root (check parent directories too). No `.nvmrc` anywhere means this isn't the fix — report the raw error instead.

2. **Switch, don't guess.** Run `nvm install` with no argument in the repo root — it reads `.nvmrc` itself, installing that version first if missing.

3. **Verify.** Re-run `node -v`; it must now satisfy the range `.nvmrc` / `package.json`'s `engines` / `devEngines` declares.

4. **Retry the original command** in that same shell.

Never edit `.nvmrc`, `engines`, or `devEngines` to match whatever Node happens to be installed — that changes the project's requirement, not your environment.

If `nvm` itself isn't installed, or `nvm install` fails to fetch that version, stop and report the failure — installing `nvm`/Node distributions is outside this skill's scope.
