## Agent skills

### Issue tracker

Issues live in GitHub Issues (ericmasiello/skills), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Branching

Never write directly to `main` — this repo requires PRs. One branch per task, however many skills it touches, not one branch per skill. See `docs/agents/branching.md`.

### Matt Pocock skills

Never modify a skill owned by Matt Pocock without the user's explicit approval in the current conversation. A skill is his if its entry in `.agents/.skill-lock.json` has `"source": "mattpocock/skills"`. That covers `SKILL.md` and every file in its folder. Ask first, name the skill and the exact change, and wait for a yes.

These skills must match upstream so `npx skills update` can sync them without losing anything. Put personal behavior in a wrapper instead, as `setup-ericmasiello-skills` and `to-tickets-ericmasiello` do. Syncing a skill to upstream when the user asks for that is not a modification.
