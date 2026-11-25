# How should a TypeScript CLI live in this repo?

Research for [#111](https://github.com/ericmasiello/skills/issues/111), on the podfeed map [#106](https://github.com/ericmasiello/skills/issues/106). This file gives facts and a recommended stack. The decision belongs to [#116](https://github.com/ericmasiello/skills/issues/116) ("What is the shape of the podfeed CLI?").

Researched 2026-11-25 on macOS with Node v24.22.1 (the nvm default), npm 11 and ffprobe 9.0.2. Every experiment ran in a throwaway temp directory, never in the repo. A claim marked **[exp]** comes from one of those experiments. The scripts are summarized in the [Appendix](#appendix-experiments).

## 1. Existing patterns in this repo

### How the TypeScript skills run

| Aspect | `_ixl-shared` | `ixl-daily-checkin` | `ixl-weekly-checkin` |
|---|---|---|---|
| `package.json` | `private`, `"type": "module"`, no deps | `private`, `type: module`, `engines.node >=24`, devDeps `typescript ^5.7.0` and `@types/node ^24` | Same, plus deps `google-auth-library` and `google-spreadsheet` |
| `tsconfig.json` | none | `module: nodenext`, `noEmit`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `strict` | identical |
| `.nvmrc` | none | `24` | `24` |
| Runner | imported only | `node --experimental-strip-types collect-daily-data.ts` (npm script) | same pattern for `collect`, `update` and `validate` |
| Typecheck | n/a | `npm run typecheck`, which runs `tsc --noEmit` | same |

Sources: `.agents/skills/_ixl-shared/package.json`, `.agents/skills/ixl-daily-checkin/{package.json,tsconfig.json,.nvmrc}`, `.agents/skills/ixl-weekly-checkin/{package.json,tsconfig.json,.nvmrc}`.

- **No build step and no `tsx`.** Both `package.json` descriptions say the scripts are "run directly by Node's built-in type-stripping (no build step, no ts-node)".
- **Shebang.** `collect-daily-data.ts` and `update-weekly-log.ts` begin with `#!/usr/bin/env -S node --experimental-strip-types`. Only `update-weekly-log.ts` has the executable bit set in the working tree.
- **How a skill calls its script.** `ixl-daily-checkin/SKILL.md` (Step 1) runs `nvm use` and then `node --env-file=../_ixl-shared/.env collect-daily-data.ts <child>`. The path is relative to the skill directory, and the command has *no* strip-types flag, so it relies on Node ≥23.6 stripping types by default (see §2). The Python skill `podcast` follows the same skill-dir-relative pattern: `uv run <skill-dir>/synthesize.py` (`.agents/skills/podcast/SKILL.md`).
- **Shared code** lives in an underscore-prefixed folder with no `SKILL.md` (`_ixl-shared`). Callers import it by relative path (`../_ixl-shared/ixl-client.ts`). It needs its own `"type": "module"` so that `tsc` resolves the module kind across the folder boundary ([ADR 0014](../adr/0014-ixl-shared-extracts-reusable-ixl-client-for-daily-and-weekly-checkins.md)).
- **Dependencies are installed by hand.** `ixl-daily-checkin/SETUP.md` says to run `nvm use` and then `npm install` inside the skill directory. `setup.sh` never runs `npm`. `node_modules` is gitignored repo-wide (`.gitignore`).
- **No JS test runner exists in the repo.** No `*.test.ts` files and no `vitest` or `node --test` scripts are present. The only test file is Python (`.agents/skills/unslop/scripts/test_mechanical_audit.py`). CI runs one workflow, `.github/workflows/verify-symlinks.yml`, which calls `scripts/verify-setup-symlinks.sh` on `ubuntu-latest`. No CI job typechecks or tests the TS skills.
- **TypeScript version.** The `^5.7.0` range currently resolves to 5.9.3 in both skills' `node_modules`. npm's latest is 7.0.2, published 2026-07-08 ([registry](https://registry.npmjs.org/typescript)). Node recommends TS ≥5.8 for type stripping ([Node TS docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html#type-stripping)), and `erasableSyntaxOnly` first shipped in 5.8.
- **ffmpeg/ffprobe is already a README prerequisite** (`brew install ffmpeg`, used by `podcast`). The `podcast` skill already calls `ffprobe -v error -show_entries format=duration ...` (`.agents/skills/podcast/synthesize.py`). Source: `README.md` §Prerequisites.

### How `setup.sh` places things

- `link src dest` is idempotent. A correct symlink, or one that reaches the same target by another route, prints `ok`. A foreign symlink prints `SKIP`. An existing real file or directory is moved to `dest.bak.<UTC>` and then linked ([ADR 0005](../adr/0005-setup-sh-backs-up-conflicts-instead-of-skipping.md)). A missing `src` prints `SKIP` and links nothing (`setup.sh`, `link()`).
- Every top-level `.agents/` entry and every `.agents/skills/<name>` entry is linked individually into `~/.agents`, `~/.agents/skills` and `~/.claude/skills` ([ADR 0009](../adr/0009-agents-skills-becomes-real-dirs-with-per-entry-symlinks.md), [ADR 0012](../adr/0012-setup-sh-links-skills-into-claude-code.md)). A CLI inside a skill folder therefore appears automatically at `~/.agents/skills/<name>/…` and `~/.claude/skills/<name>/…`.
- Today `setup.sh` links nothing into a PATH directory. It only *checks* for CLIs (`check_cli gh td twg agent-browser`).
- CI (`scripts/verify-setup-symlinks.sh`) runs `setup.sh` against a scratch `HOME` and asserts the exact set of links. Any new link target has to be added to that script, or the check won't cover it.

## 2. Node: type stripping and `node --test`

- **Type stripping status.** Stripping was enabled by default in v23.6.0 and backported to v22.18.0. The experimental warning went away in v24.3.0, and stripping became **Stable** in v24.12.0 / v25.2.0. The opt-out flag was renamed `--no-strip-types` ([Node TS docs, history](https://nodejs.org/docs/latest-v24.x/api/typescript.html), [CLI `--no-strip-types`](https://nodejs.org/docs/latest-v24.x/api/cli.html#--no-strip-types)).
- **The old flag still works.** **[exp]** `node --experimental-strip-types x.ts` runs cleanly on v22.18.0, v24.22.1 and v26.13.1. On v22.6.0 it runs but prints an ExperimentalWarning. On v20.19.0 it fails with `bad option`. Without the flag, v22.6.0 and v20.19.0 fail with `ERR_UNKNOWN_FILE_EXTENSION`. On this machine nvm has 27 Node versions installed (v16 through v26) and the default is `v24`.
- **Limits of type stripping.** Only erasable syntax is allowed: no `enum`, no runtime `namespace`, no parameter properties, no import aliases, no decorators. `tsconfig.json` is ignored (no `paths`). Type imports need `import type`. Import specifiers must include `.ts`. Module kind follows the nearest `package.json` `type` field ([Node TS docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html#typescript-features)). The repo's existing `tsconfig.json` (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`) enforces exactly these limits at typecheck time.
- **No stripping under `node_modules`.** "Node.js refuses to handle TypeScript files inside folders under a `node_modules` path" ([Node TS docs, "Type stripping in dependencies"](https://nodejs.org/docs/latest-v24.x/api/typescript.html#type-stripping-in-dependencies)). **[exp]** When a `.ts` bin was installed as a *copied* package (`npm pack` followed by `npm install -g podfeed-0.0.0.tgz`), running it threw `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
- **Symlinked mains resolve to their real path.** By default Node resolves the main module through symlinks; `--preserve-symlinks-main` opts out ([CLI docs](https://nodejs.org/docs/latest-v24.x/api/cli.html#--preserve-symlinks-main)). **[exp]** An extensionless symlink `bin/podfeed -> …/bin/podfeed.ts` with shebang `#!/usr/bin/env node` runs correctly. Node sees the real `.ts` path, applies stripping and reads `"type": "module"` from the real location's `package.json`. With `--preserve-symlinks-main` it fails, because the main is treated as extensionless JS.
- **`node --test`.** The test runner has been stable since v20.0.0 ([CLI `--test`](https://nodejs.org/docs/latest-v24.x/api/cli.html#--test)). Unless `--no-strip-types` is set, its default globs also match `**/*.test.{cts,mts,ts}`, `**/test/**/*.ts` and similar ([test runner docs](https://nodejs.org/docs/latest-v24.x/api/test.html#running-tests-from-the-command-line)). Snapshot testing is no longer experimental as of v23.4.0. Coverage (`--experimental-test-coverage`) is still Stability 1, and `mock.module()` is 1.0 and needs `--experimental-test-module-mocks` ([test runner docs](https://nodejs.org/docs/latest-v24.x/api/test.html)). **[exp]** `node --test` in a `type: module` folder found and passed `test/greet.test.ts` with zero dependencies.

## 3. Getting `podfeed` onto PATH

| Option | How | Works for the terminal | Works for agents | Tradeoffs |
|---|---|---|---|---|
| **A. `setup.sh` links into `~/.local/bin`** | One new line, e.g. `link "$REPO_DIR/.agents/skills/podfeed/bin/podfeed.ts" "$HOME/.local/bin/podfeed"` | Yes, if `~/.local/bin` is on PATH | Usually (see caveats) | Reuses `link()`, so it gets ADR 0005's backup-not-skip behavior for free. The link is version-independent: the same link serves whichever Node is active. Edits in the repo go live without a re-link. Needs `verify-setup-symlinks.sh` extended. A backup made in a PATH directory (`podfeed.bak.<UTC>`) is itself on PATH. It's harmless, but worth knowing. |
| **B. `npm link`** | `cd <cli dir> && npm link` | Yes, under the active nvm version | Only when the agent's shell uses the same Node version | **[exp]** This works: it creates `{prefix}/lib/node_modules/podfeed -> <repo dir>` and `{prefix}/bin/podfeed`, and Node runs the `.ts` because the realpath is outside `node_modules`. But the prefix is per Node version (`npm link` "uses the global prefix", [npm-link docs](https://docs.npmjs.com/cli/commands/npm-link)), which here is `~/.nvm/versions/node/v24.22.1/`. After `nvm use 22`, or a Node patch upgrade, `podfeed` disappears from PATH. It also runs outside `setup.sh`, so no idempotency or CI coverage. |
| **C. Skill calls it by absolute or skill-dir path** | `SKILL.md` runs `node <skill-dir>/bin/podfeed.ts add …` | No (needs an alias or option A) | Yes, regardless of PATH | Matches the existing ixl and podcast pattern (§1). Immune to PATH differences between agent shells. On its own it gives no `podfeed` command in the terminal. |
| *(D. `npm install -g` of a packed tarball)* | | **No** | **No** | **[exp]** Fails with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, because the `.ts` lands inside `node_modules`. It would need a build step to `.js`. |

Caveats that apply to A and B:

- **`~/.local/bin` on PATH.** The XDG Base Directory spec says user executables "may be stored in `$HOME/.local/bin`" and that distributions should put it on PATH ([XDG basedir spec](https://specifications.freedesktop.org/basedir-spec/latest/)). macOS doesn't do this by default. On this machine it is on PATH because `~/.zshrc` and `~/.profile` source `~/.local/bin/env` (written by the `uv` installer). The OpenCode session that ran this research saw `~/.local/bin` first in PATH. `~/bin` is also on PATH (`~/.zshrc` line 2) and already holds hand-written personal scripts (`studio-worktree-zed`, `studio-adopt-worktree`) that the repo doesn't manage.
- **Claude Code's shell snapshot.** Claude Code's Bash tool sources a shell snapshot whose final `export PATH=` is "derived from the launch-time process environment — not from the user's shell config". An issue report describes `~/.local/bin` being dropped when Claude Code is launched without it in its environment ([anthropics/claude-code#43127](https://github.com/anthropics/claude-code/issues/43127), closed 2026-07-06). Launching from a terminal inherits the terminal's PATH. Launching from the Dock or the desktop app may not. Option C sidesteps this.
- **Which `node` runs.** `#!/usr/bin/env node` uses whatever `node` is first on the caller's PATH. If an agent or terminal has run `nvm use 20` for some project, the CLI fails with `ERR_UNKNOWN_FILE_EXTENSION` **[exp]**. Keeping the `--experimental-strip-types` shebang doesn't help on v20 (`bad option`). An `engines` field isn't enforced at run time. A version check inside `bin/podfeed.ts` can't help either, because loading fails before any code in the file runs. The workable mitigations are a tiny POSIX `sh` shim that picks a suitable `node`, or the skill-dir invocation preceded by `nvm use` (option C, as the ixl skills do). This is a residual risk to note, not something this research resolves.
- **Dependencies still need installing.** Under every option, `npm install` (or `npm ci`) has to run once in the CLI folder. `setup.sh` doesn't do that today (§1).

## 4. XML library comparison (RSS 2.0 + iTunes namespace)

### Maintenance and weight

| | fast-xml-parser | xmlbuilder2 | xml2js |
|---|---|---|---|
| Latest on npm | 5.12.1, 2026-11-13 | 4.0.3, 2025-12-01 | 0.6.2, 2023-07-26 |
| Last commit on default branch | 2026-11-14 | 2026-02-03 | 2026-04-30 (still 0.6.2 in `package.json`, no release since 2023) |
| Open issues + PRs, stars | 34, 3.1k | 39, 410 | 259, 5.0k |
| Weekly downloads (Nov 17–23) | 117.6M | 19.4M | 65.5M |
| Bundled types | yes (`src/fxp.d.ts`) | yes (`lib/index.d.ts`) | no (`@types/xml2js` 0.4.14) |
| Installed tree **[exp]** | 8 packages, ~2.1 MB | 7 packages, ~4.7 MB (pulls in `js-yaml`) | 3 packages, ~3.7 MB (`sax`, `xmlbuilder@11`) |
| GitHub advisories | 13 to date. Recent ones are entity-expansion DoS, plus one builder **CDATA/comment injection** fixed in 5.7.0 ([GHSA-gh4j-gqv2-49f6](https://github.com/advisories/GHSA-gh4j-gqv2-49f6)). All are fixed in ≤5.12.1. Latest: [GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4), ≤5.11.2 | none found | 1 (prototype pollution, <0.5.0) |

Sources: npm registry metadata (`https://registry.npmjs.org/<name>`), the npm downloads API, the GitHub repo APIs for [NaturalIntelligence/fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser), [oozcitak/xmlbuilder2](https://github.com/oozcitak/xmlbuilder2) and [Leonidas-from-XIV/node-xml2js](https://github.com/Leonidas-from-XIV/node-xml2js), and the [GitHub Advisory Database](https://github.com/advisories?query=ecosystem%3Anpm+fast-xml-parser). The CLI only parses a feed it wrote itself, pulled from my own NAS, so the parser DoS advisories are low-exposure here. The builder-injection one matters, because episode titles and descriptions are user input.

### Round-trip experiment **[exp]**

Each library parsed a feed with `xmlns:itunes` and `xmlns:content`, a CDATA `<description>`, a title containing `& < " '`, an `<enclosure url="…?x=1&amp;y=2" length="0012345">`, `<guid isPermaLink="false">` and self-closing `<itunes:image href=…/>`. It then prepended a new `<item>` whose title and URL contained `&` and `<`, and serialized the result.

| Property | fast-xml-parser 5.12.1 | xmlbuilder2 4.0.3 | xml2js 0.6.2 |
|---|---|---|---|
| `xmlns:*` declarations and `itunes:` prefixes kept | yes | yes. `ele('itunes:duration')` with no namespace argument also emitted no extra `xmlns` | yes |
| Existing CDATA kept as CDATA | yes, with `cdataPropName`. But `format: true` adds whitespace text nodes around the CDATA inside `<description>` (re-parsed with `trimValues:false`, the text is `"\n      \n    "`). Unformatted output is exact | yes, exact | no. Without `cdata:true` it is re-escaped as `&lt;b&gt;`. With `cdata:true` *every* text node that needs escaping is wrapped in CDATA, including titles that were plain-escaped |
| Escaping of new text and attributes | correct (`&amp; &lt; &gt;`). Also escapes `"`→`&quot;` and `'`→`&apos;` in text (valid, just noisy) | correct and minimal | correct |
| Attribute values kept verbatim (`length="0012345"`) | yes with `parseAttributeValue:false` (the default) | yes | yes |
| Defaults that bite | `ignoreAttributes` defaults to **true**, so `<enclosure>` became `""`. `parseTagValue` defaults to **true**, so `itunes:explicit` `false` became a boolean | none seen | output adds `standalone="yes"` to the XML declaration |
| Sibling order | groups same-name siblings by default (`title, item A, author, item B` became `title, item A, item B, author`). `preserveOrder: true` keeps document order, at the cost of a much clunkier array-of-objects shape | DOM, so order is kept. `insertBefore` puts the newest item first | grouped, like fast-xml-parser's default |
| Malformed input (`<title>a & b</title>`) | parser accepts it. `XMLValidator.validate()` reports `InvalidChar` with line and column | parser **accepts** it silently | throws `Invalid character in entity name` |
| Programming model | plain JS object, easy to type | DOM / fluent builder (`.ele().txt()`). The `format:'object'` export showed `"Eric &amp; Friends"`, i.e. still escaped | arrays everywhere (`channel[0].item`) |

Working fast-xml-parser options: `{ ignoreAttributes: false, attributeNamePrefix: '@_', cdataPropName: '__cdata', parseTagValue: false, isArray: (n) => n === 'item' }` for both `XMLParser` and `XMLBuilder`.

### Other dependencies

- **ffprobe, by spawning it directly.** `ffprobe -v error -print_format json -show_format [-show_streams] <file>` gives JSON on stdout. It exits non-zero ("a positive exit code") when the input can't be opened or recognized ([ffprobe docs](https://ffmpeg.org/ffprobe.html), §2 and §3.4 `-print_format`/`-show_format`, §4.5 json writer). **[exp]** On a generated MP3, `format.duration` was the string `"3.000000"` (seconds), `format.size` was `"24532"`, and ID3 tags were under `format.tags` (`title`, `artist`). A missing file printed an error on stderr, `{}` on stdout, and exited 1. A missing ffprobe binary shows up in Node as a spawn `ENOENT`, which can be mapped to the "install ffmpeg" message the brief asks for. The JSON writer replaces invalid UTF-8 in tags by default (`string_validation=replace`, [ffprobe docs §4](https://ffmpeg.org/ffprobe.html)). The `enclosure length` should come from `fs.stat`, not from `format.size`.
- **Wrappers.** [`fluent-ffmpeg`](https://www.npmjs.com/package/fluent-ffmpeg) 2.1.3 is marked *deprecated* on npm ("Package no longer supported"). [`ffprobe`](https://www.npmjs.com/package/ffprobe) 1.1.2 was last published in 2020 and has no types. [`music-metadata`](https://www.npmjs.com/package/music-metadata) 12.8.4 is pure JS, actively released (2026-11-25) and bundles types. **[exp]** It installs 11 packages (~2.5 MB) and would remove the ffprobe system dependency, but the brief specifies ffprobe and ffmpeg is already a repo prerequisite. [`node-id3`](https://www.npmjs.com/package/node-id3) 0.2.9 only reads tags, not duration.
- **Test runner.** `node --test` has zero dependencies, runs `.ts` tests natively, and has stable snapshots (§2). [`vitest`](https://www.npmjs.com/package/vitest) 5.1.1 **[exp]** installs 35 packages (~36 MB). It offers richer watch mode, mocking and coverage. The repo has no JS test-runner precedent either way.

## 5. Recommended stack (for #116 to decide)

1. **Location.** Put the CLI inside its skill folder, `.agents/skills/podfeed/` (`SKILL.md`, `package.json`, `bin/podfeed.ts`, `src/*.ts`, `test/*.test.ts`, `.nvmrc`, `tsconfig.json`, `config.example.json`). This mirrors the ixl skills and needs no change to `setup.sh`'s skill linking. If later phases add a second skill that shares the CLI, the ADR 0014 pattern (`_podfeed/` with no `SKILL.md`) is the precedent.
2. **Runtime.** Node ≥24 type stripping, no build and no `tsx`. Copy the ixl `tsconfig.json`, `.nvmrc` `24` and `engines >=24`, with `"type": "module"` and `"bin": { "podfeed": "./bin/podfeed.ts" }`. The shebang can be plain `#!/usr/bin/env node`, since stripping is stable and on by default from v24.12. The ixl scripts' `-S node --experimental-strip-types` form also works on v24 and v26 if consistency matters more. Typecheck with `tsc --noEmit`. Consider TS ≥5.8, since `erasableSyntaxOnly` needs it.
3. **PATH.** Combine A and C. Add one `link` line in `setup.sh` (`~/.local/bin/podfeed -> <repo>/.agents/skills/podfeed/bin/podfeed.ts`) for terminal use, and extend `verify-setup-symlinks.sh` to match. Have `SKILL.md` call the CLI by skill-dir path (`node <skill-dir>/bin/podfeed.ts …`) so agents don't depend on PATH or a snapshot. Skip `npm link`, which is per-nvm-version.
4. **XML.** **fast-xml-parser ≥5.12.1** (most active, lightest, typed, built-in `XMLValidator`), with its options pinned as in §4, unformatted or carefully formatted output, and the validator run on the built feed before pushing. The CLI owns the feed, so its loss of interleaved sibling order doesn't matter (items end up grouped after channel tags). **xmlbuilder2** is the runner-up if a byte-faithful DOM edit of hand-edited feeds matters more than maintenance activity and strict parsing. Avoid **xml2js**: no release since 2023, no bundled types, and it can't preserve CDATA selectively.
5. **Metadata.** Spawn `ffprobe -v error -print_format json -show_format` via `node:child_process` `execFile`. Use no wrapper.
6. **Tests.** `node --test "test/**/*.test.ts"` with `node:assert/strict`. Use no vitest.

## Open questions surfaced

- **Who installs dependencies, and does CI test TS skills?** `setup.sh` links skills but never runs `npm ci`, and no CI job typechecks or tests any TS skill. A CLI that agents run unattended raises whether `setup.sh` (or a per-skill `SETUP.md`, as ixl does) owns `npm ci`, and whether a CI job should run `tsc --noEmit` and `node --test` for `.agents/skills/*/package.json`.
- **Node version guard.** `#!/usr/bin/env node` fails opaquely when a shell has an older nvm Node active. Is a `sh` shim that selects a Node ≥24 worth it, or is the skill-dir invocation with `nvm use` (the ixl pattern) enough?

## Appendix: experiments

Everything ran under `$TMPDIR/opencode/{xmlexp,pathexp}`, not in this repo.

- **XML round-trip:** `feed.xml` as described in §4. Per library: `fast-xml-parser/rt.mjs` (`XMLParser`→`unshift` item→`XMLBuilder`), `xmlbuilder2/rt.mjs` (`create(xml)`, build `item`, `channel.node.insertBefore(item.node, firstItem.node)`, `end({prettyPrint:true})`), `xml2js/rt.mjs` (`parseStringPromise`→`unshift`→`new Builder({cdata:true}).buildObject`). Follow-ups covered defaults, whitespace re-parse, malformed input and sibling order.
- **Dependency weight:** `npm i <pkg>` in an empty folder, then `npm ls --all --parseable | sort -u | wc -l` and `du -sk node_modules`.
- **PATH:** a `podfeed` package with `"type":"module"`, a `bin/podfeed.ts` with `#!/usr/bin/env node` importing `../src/greet.ts`. Tested by direct execution, through an extensionless symlink in a PATH directory, with `--preserve-symlinks-main`, via `npm_config_prefix=<tmp> npm link`, and via `npm pack` followed by `npm install -g <tgz>`. Also tested with and without `--experimental-strip-types` on Node v20.19.0, v22.6.0, v22.18.0, v24.22.1 and v26.13.1, and with `node --test` on `test/greet.test.ts`.
- **ffprobe:** `ffmpeg -f lavfi -i sine=… -metadata title="Tom & Jerry" -id3v2_version 3 t.mp3`, then `ffprobe -v error -print_format json -show_format t.mp3`, and the same against a missing file.
