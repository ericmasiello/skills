---
name: stokowski-cli
description: "Dispatch work to Stokowski's agent workflows via the `stok` CLI, check or follow a work item live, and act on it — answer a pending gate decision, send a signal, add input, cancel. Use when the user wants to dispatch work to Stokowski, check/watch a Stokowski work item's status, decide a pending gate, send a signal, or asks about `stok`/Stokowski work items (Vistaprint work-context)."
compatibility: "Requires the stok CLI (@vp/stokowski-cli) installed from Vista's Artifactory npm registry and authenticated via 'stok login' (Cimpress SSO) — Vistaprint work-context only."
---

# Stokowski CLI (stok)

`stok` dispatches work to [Stokowski](https://gitlab.com/vistaprint-org/vista-engineering/engineering-productivity/ci-cd/remote-agents/stokowski)'s native agent-workflow API, then lets you follow and act on it. This is one of two ways to hand work to Stokowski — see "Relationship to label-based hand-off" below for the other.

## Install

```sh
npm install --global @vp/stokowski-cli --registry https://vistaprint.jfrog.io/vistaprint/api/npm/npm/
stok login        # Cimpress SSO in the browser, then prints who you are
```

Prerequisites: Node 20+, and an Artifactory npm token for the `@vp/*` scope. Most Vista machines already carry the token in `~/.npmrc` — confirm with `npm view @vp/stokowski-cli version --registry https://vistaprint.jfrog.io/vistaprint/api/npm/npm/`; a version number means you're set, an `E401`/`E404` means `~/.npmrc` needs `//vistaprint.jfrog.io/vistaprint/api/npm/npm/:_authToken=${VP_ARTIFACTORY_TOKEN}`. `stok: command not found` after a successful install means npm's global bin isn't on `PATH` (`$(npm prefix -g)/bin`). `stok upgrade` pulls the latest build; `stok` never updates itself.

## Discover live, don't memorize flags

`stok`'s command surface is self-documenting and evolves independently of this skill — read it at call time instead of trusting a remembered flag list:

```bash
stok --help                 # command list, exit codes, JSON envelope shape, auth and config precedence
stok <command> --help       # that command's exact flags, an EXAMPLES block, and a SYNC/ASYNC note for writes
```

## Gotchas not in `--help`

- **Writes are async by default.** `dispatch`, `input`, `decide`, `signal`, `cancel`, `close`, `run`, `ask` all return the instant Stokowski accepts the request and print the resulting id(s). Add `--wait` to block and stream until the work reaches a terminal state (or a gate/signal, see next point) — then the exit code tells you the outcome.
- **Exit 7 means "stopped for a human," not "failed."** `--wait`/`watch` halt at exit 7 the moment a work item hits a review gate (`awaiting_review`) or an external-signal wait (`awaiting_signal`) — treat it as a normal pause, not an error, and follow the hint `stok status` prints (`stok decide <id> ...` or `stok signal <id> ...`). Pass `--through-gates` to keep following instead of stopping there.
- **`decide` and `signal` answer two different kinds of pending action.** A work item can be waiting on a workflow-defined gate decision (`stok decide <id> [choice]`) or on an external signal (`stok signal <id> <signal>`) — never both read the same way. Run `stok status <id>` first; it names exactly which one is pending and prints the exact follow-up command, including the valid choices/signals (the CLI never hard-codes these — they come from the server).
- **`--json` always ends in exactly one envelope**: `{"ok":true,"data":...}` or `{"ok":false,"error":{...},"exitCode":N}`. `watch` and `--wait` print NDJSON event/state lines first and still end with that one envelope as the final line — parse the last line, not the whole stream, for the outcome.
- **No `stok logout`.** The SSO token cache (`~/.vp-token.json`) is shared with other `@vp/dev-auth` tools; `stok login` forces a fresh login. For CI/agents, set `STOKOWSKI_TOKEN` to a static bearer token instead of SSO — `stok` skips the browser whenever it's set.
- **`close` and `cancel` are destructive** and require `--yes` when run non-interactively (an interactive terminal gets a confirm prompt, default No).
- **Set a default project once** (`export STOKOWSKI_PROJECT=<id>` or `profiles.<name>.project` in `~/.config/stokowski/config.json`) instead of passing `-p` on every call. Precedence: flag, then env, then config file, then the built-in `production` profile. Use `--profile sandbox` to target the sandbox deployment instead of production.
- **Requests carry an idempotency key** (`--idempotency-key`, auto-generated otherwise) — retrying a `dispatch`/`input`/`decide`/etc. after a network blip is safe.

## Relationship to label-based hand-off

[`stokowski-handoff-labels`](../stokowski-handoff-labels/SKILL.md) hands an ERICRULEZ ticket to Stokowski by applying Jira labels that Stokowski polls for — no CLI call, no immediate work item id, and no live follow-up. Use `stok dispatch` instead when you need the work item id back immediately, want to `stok watch` it live, or are dispatching work that isn't an ERICRULEZ ticket at all (e.g. ad hoc work from a brief file). The two paths create work through different triggers; don't mix them for the same request.
