# This repo now tracks opencode runtime config, not just skills

Originally this repo was purely a skills collection (per its own `CONTEXT.md`). Bringing over custom opencode agents/commands and the `opencode.json`/`oh-my-openagent.json` config from another machine raised the question of where their source of truth should live: a second repo, or this one.

Decided to keep everything in one repo, `opencode/` alongside `.agents/`, because skills and opencode config are tightly coupled here — several skills dispatch Companion agents (see `CONTEXT.md`) that must be installed together, and splitting them across repos would make that coupling invisible. The cost: this repo is no longer purely employer/tool-agnostic "skills" — it's now Eric's full personal opencode setup.

Consequence: `CONTEXT.md`'s description was updated to reflect the broader scope.
