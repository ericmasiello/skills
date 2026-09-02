---
name: playwright
description: "MUST USE for any browser automation, browsing, screenshots, or web testing — before openchamber_web or any in-app browser panel. Launches playwright-cli headed by default."
---

Go straight to `playwright-cli` for browser work. Never `openchamber_web` or any other embedded/in-app browser — third-party SaaS apps (Jira, Confluence, and similar enterprise tools) routinely render blank or hang in embedded browsers; real Chrome via `playwright-cli` is the reliable path.

## Defaults

- **Headed, always.** Every `open` gets `--headed` — `playwright-cli` is headless unless told otherwise, and headless is never what's wanted here. Drop it only if the user explicitly asks for headless.
- **Chrome, persistent, for logged-in work.** Anything touching an authenticated app: `--browser=chrome --persistent`. A fresh persistent profile starts logged out — reuse a saved session (below) instead of asking the user to log in on every run.

```bash
playwright-cli open <url> --browser=chrome --persistent --headed
playwright-cli snapshot
playwright-cli click e3
playwright-cli close
```

## Reusing an authenticated session

```bash
playwright-cli state-save auth.json      # once, right after a manual login
playwright-cli state-load auth.json      # every run after
```

## Command reference

`playwright-cli --help` and `playwright-cli <command> --help` are the source of truth — commands and flags drift between CLI versions, so read them directly rather than a memorized list. Core areas: navigation (`goto`, `go-back`, `reload`), interaction (`click`, `fill`, `type`, `press`, `hover`, `select`, `upload`), inspection (`snapshot`, `find`, `screenshot`, `eval`), tabs, storage (cookies/localStorage/sessionStorage), network mocking (`route`), and devtools (`console`, `network`, `tracing-start`/`tracing-stop`).

## Config-file alternative to `--headed`

No global override exists for the headless default — only a per-project `.playwright/cli.config.json`, read from the CLI's working directory:

```json
{ "browser": { "launchOptions": { "headless": false } } }
```

`--headed` on every `open` (above) works everywhere with no file to maintain — prefer it. Reach for the config file only in a repo sessions launch from constantly.
