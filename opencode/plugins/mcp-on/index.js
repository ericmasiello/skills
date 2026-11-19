// Turns MCP servers back on per repository, without each repo repeating a
// server's definition in its own opencode.json.
//
// Every server in opencode/opencode.json (the global config, symlinked to
// ~/.config/opencode/opencode.json) ships `disabled: true`, so a long list of
// work-context servers costs nothing in projects that don't use them. A repo
// opts in by committing `.opencode/mcp-on.json` next to its code:
//
//   ["skylight"]
//
// That's the whole mechanism. It works because an MCP transform edits the
// merged configuration server-by-server, so opting in inherits the url,
// headers and environment from the global entry. Repeating the server object
// in a project opencode.json instead *replaces* that entry: a partial one such
// as `{"disabled": false}` is dropped by config normalization, and a complete
// one silently drifts from the global copy. See docs/adr/0017-*.md.
//
// Reading a file rather than hard-coding names is deliberate: this plugin is
// installed once, globally, and serves every repo. A repo-local
// `.opencode/plugins/` copy would work too, but every repo that opted in would
// need its own copy of this code.
//
// No `@opencode/plugin` import: that package isn't resolvable from the global
// plugin directory, and a bare default export is all OpenCode needs.
import { readFileSync } from "node:fs"
import { join } from "node:path"

const OPT_IN_FILE = join(".opencode", "mcp-on.json")

function readOptIn(directory) {
  let raw
  try {
    raw = readFileSync(join(directory, OPT_IN_FILE), "utf8")
  } catch {
    return [] // no opt-in file: every server stays as configured (off)
  }

  let names
  try {
    names = JSON.parse(raw)
  } catch (error) {
    // Stay quiet on a missing file but not on a malformed one: silently
    // ignoring a typo would look like "the server is off for no reason".
    console.warn(`[mcp-on] ignoring ${OPT_IN_FILE}, not valid JSON: ${error.message}`)
    return []
  }

  if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
    console.warn(`[mcp-on] ignoring ${OPT_IN_FILE}, expected a JSON array of server names`)
    return []
  }

  return names
}

export default {
  id: "mcp-on",
  async setup(ctx) {
    const want = readOptIn(ctx.location.directory)
    if (want.length === 0) return

    await ctx.mcp.transform((editor) => {
      for (const name of want) {
        if (!editor.get(name)) {
          // A name that matches no configured server is almost always a typo
          // or a server since removed from the global config.
          console.warn(`[mcp-on] ${OPT_IN_FILE} names "${name}", which is not a configured MCP server`)
          continue
        }
        editor.update(name, (server) => {
          server.disabled = false
        })
      }
    })
  },
}
