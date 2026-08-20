# opencode.json secrets use opencode's {env:VAR} substitution, not a plain-text commit

`~/.config/opencode/opencode.json` contains a literal API key (the Stitch MCP server's `X-Goog-Api-Key` header). Version-controlling this file for the symlink-based install (ADR-0003) would otherwise put that key in git history.

Decided to rewrite the value as `{env:STITCH_API_KEY}` — opencode natively substitutes environment variables into config at load time — and export the real key from Eric's untracked shell profile instead. Rejected leaving `opencode.json` entirely untracked, since that would make the MCP server list, model default, and plugin list unreproducible across machines for the sake of one field.

Consequence: any future config field that needs a secret must follow the same `{env:VAR}` pattern before being committed.
