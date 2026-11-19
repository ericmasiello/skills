# MCP servers are off by default; a repo opts in with `.opencode/mcp-on.json` + one global plugin

`opencode/opencode.json` had grown a long list of work-context MCP servers, and three of them (`gitlab`, `n8n`, `slack`) plus `skylight` were enabled. Every project on this machine paid for all of them: each connection costs a tool catalog, and the model picks from a wider tool set than any single repo needs.

The obvious fix — set `disabled: true` everywhere and let a repo flip one back on — does not work as a plain project config. Measured on v2.0.23: a higher-precedence config **replaces** the whole server object, so a project entry of

```jsonc
{ "mcp": { "servers": { "skylight": { "disabled": false } } } }
```

is rejected by config normalization (`skipped malformed recognized value`) and the server disappears entirely. Repeating the complete object works, but duplicates the url/headers/environment, which then drift from the global copy. That is what this repo's root `opencode.json` did before this ADR.

`policies` cannot express the intent either: `mcp.use` only ever tightens, so a `deny` blocks a server but an `allow` never re-enables one. There is no config-level "off unless this repo says otherwise".

Decided: every server in the global config ships `disabled: true` except `slack`, and one plugin — `opencode/plugins/mcp-on/`, symlinked by `setup.sh` into `~/.config/opencode/plugins/mcp-on` — reads `.opencode/mcp-on.json` from the current repo and flips the named servers on through `ctx.mcp.transform`. That transform edits the *merged* configuration, so an opt-in inherits the global server's url, headers and environment instead of restating them.

```jsonc
// .opencode/mcp-on.json in an opting-in repo
["skylight"]
```

Rejected a repo-local `.opencode/plugins/mcp-on/` copy: it works, but every repo that opts in would carry its own copy of the same code, and the reading of a *file* is what lets one installed plugin serve every repo.

`slack` stays globally on because it is the one work-context server used across repos rather than in one. A plugin in the global config dir cannot be resolved by teammates cloning a repo, so a teammate without `setup.sh` gets "server stays off" — the safe direction — rather than a broken config.

Consequence: opting a repo in is now a one-line JSON commit, and removing a server from the global config is the only place its definition lives. A typo or a stale name in `.opencode/mcp-on.json` logs a warning instead of failing silently, because the plugin is the only thing standing between a configured server and a disabled one.
