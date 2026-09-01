---
name: glab-auth-error
description: "Use when a `glab` command fails with 401 Unauthorized, \"no token found\", or similar auth errors. Run `glab auth login`/`glab auth status` — don't hunt for an alternate auth path (env vars, config edits, tokens)."
---

1. **Confirm it's an auth failure**, not a permissions/scope one — `glab auth status` shows the actual cause (no token vs. wrong host vs. logged in but 403 on the specific action).
2. **If no token / not logged in**: `glab auth login --hostname <host>`. This is the fix — not exporting `GITLAB_TOKEN`, not editing config files, not searching for a workaround.
3. **If logged in but still 401/403 on a specific call**: the token lacks scope (e.g. resolving a discussion needs Developer+ role on the project) — report this to the user rather than escalating privileges yourself.
4. **Watch for duplicate config files** — `glab` warns and silently picks one if it finds config in both `~/.config/glab-cli/` and `~/Library/Application Support/glab-cli/`; flag this to the user if seen, don't try to reconcile it yourself.
5. **Retry the original command** in the same shell once `glab auth status` is clean.

Never invent an alternate auth mechanism (raw curl with a scraped token, editing `~/.netrc`, etc.) — `glab auth login` is the supported path.
