---
name: skill-to-command
description: Create an opencode command wrapper that pins a specific model to an existing skill. Use when user wants to create a command, wrap a skill, pin a model to a skill, or create a shortcut command for a skill invocation.
---

# Wrap Skill

Create command wrappers for existing skills, pinned to a specific model.

## Workflow

1. **Identify the target skill** — Ask which skill to wrap (reference available skills from system prompt)

2. **Rename the skill** — Prefix the skill with `_` so the command gets the clean name:
   - Rename the directory (e.g., `~/.agents/skills/foo/` → `~/.agents/skills/_foo/`)
   - Update the `name` field in the SKILL.md frontmatter (e.g., `name: foo` → `name: _foo`)
   - If the skill name already starts with `_`, skip this step
   - Only rename user-scope (`~/.agents/skills/`) and opencode-scope (`~/.config/opencode/skills/`) skills — never project-scope skills

3. **Determine the command name** — Use the skill's original (pre-rename) name, replacing `:` with `-` for the filename

4. **Enumerate models** — Run `opencode models`, present list via `question` tool

5. **Get a short description** — Generate from the skill's description, append model short name in parens (e.g., `(Sonnet 4.5)`)

6. **Write the command file** to `~/.config/opencode/commands/<name>.md`:

   ```
   ---
   description: <short desc> (<Model Short Name>)
   model: <full-model-id>
   ---
   Load and execute the _<skill-name> skill. $ARGUMENTS
   ```

## Existing Examples

| Command | Wraps Skill | Model |
|---|---|---|
| `studio-do-work` | `studio:do-work` | `claude-sonnet-4.5` |
| `review-thermo` | `thermo-nuclear-review` | `claude-opus-4.6` |
| `diataxis-audit` | `diataxis` | `claude-opus-4.6` |
| `proofread-markdown` | `ce-proof` | `claude-haiku-4.5` |

## Rules

- ALWAYS rename the target skill with `_` prefix before creating the command
- ALWAYS include `$ARGUMENTS` at the end of the body line
- ALWAYS include model short name in the description parenthetical
- ALWAYS verify command file doesn't already exist before writing
- NEVER rename project-scope skills (those under the repo's `.agents/skills/`)
- Warn the user if other commands already reference the skill's old name
