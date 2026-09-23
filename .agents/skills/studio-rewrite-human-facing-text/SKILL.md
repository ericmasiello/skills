---
name: studio-rewrite-human-facing-text
description: Audit and rewrite human-facing text touched in a branch or MR using Studio writing-code-comments and unslop. Use when the user says 'studio-rewrite-human-facing-text', 'rewrite comments in MR', 'clean up text in branch', 'polish human-facing text', or provides a branch name or MR URL to rewrite text.
---

# Studio Rewrite Human-Facing Text

Audit and rewrite every code comment, commented-on code block, ADR, README, or human-facing prose file touched in a branch or MR, applying Studio's `writing-code-comments` rules, whole-entity boy-scout scoping, and `unslop` before pushing changes back up.

## Workflow

### 1. Identify branch and checkout

Identify target branch from user input (MR URL, branch name, or current checkout).

1. **GitLab MR URL** (e.g. `https://gitlab.com/.../merge_requests/123`):
   ```bash
   glab mr checkout <iid_or_url>
   ```
2. **Branch name**:
   ```bash
   git fetch origin <branch> && git checkout <branch>
   ```
3. **Implicit**: If no branch or URL is supplied, use current branch:
   ```bash
   git branch --show-current
   ```

Verify working tree is clean before proceeding.

### 2. Identify merge-base and touched files

Find the merge-base against the default branch (usually `origin/master` in Studio, or `origin/main`):

```bash
target_base=$(git merge-base HEAD origin/master 2>/dev/null || git merge-base HEAD origin/main)
```

List all files modified, added, or renamed on this branch:

```bash
git diff --name-only "$target_base"...HEAD
```

Categorize touched files into two buckets:
- **Code files**: `.ts`, `.tsx`, `.js`, `.jsx`, etc. (target for code comments and commented-on code)
- **Prose / Documentation files**: `.md`, `.mdx`, ADRs (`docs/adr/*.md`, `docs/globalAdr/*.md`), `README.md`, guides, inline text documents

### 3. Extract and scope human-facing text (Boy Scout Rule)

Inspect git diff per file:

```bash
git diff "$target_base"...HEAD -- "<filepath>"
```

Apply the **Boy Scout Rule**: take the **entire enclosing body** under consideration, not just the lines modified by the author.

- **For code comments**:
  - Locate any comment modified or added in the diff, as well as any existing comment attached to a code construct (class, component, hook, function, constant, or workaround) touched by the diff.
  - Expand scope to the **entire comment block and its immediately attached interface/function signature**, rather than just the touched line.
  - If touched code has non-obvious logic, workarounds, or exported interfaces lacking comments, treat that missing comment as a target to write.
- **For ADRs, READMEs, and prose documents**:
  - If the document was added or modified in the diff, evaluate the **entire document** (or at minimum the full enclosing section for large documents), ensuring overall coherence, tone, and clarity.

### 4. Rewrite using domain skills

#### A. Code comments (`writing-code-comments`)

Apply `writing-code-comments` rules (Studio's project-scope skill takes precedence when in Studio):

1. **Different level of detail**: Never repeat what the code already says. Add caller-level intuition (why, intent, conceptual framework) or lower-level precision (units, invariants, preconditions).
2. **Litmus test**: *Could someone write this comment just by looking at the code next to it?* If yes, delete or rewrite it.
3. **Bug fixes and workarounds**: Must explain *why* self-sufficiently without requiring tracker access. Ticket numbers may support, never replace.
4. **React components and hooks**: Document props, render purpose, re-render triggers, cleanup, dependency expectations.
5. **Testing comments**: Strictly follow **what, then why** order; terser than production comments.

#### B. Documentation and prose (ADRs, READMEs)

1. Ensure architectural decisions and documentation state context, consequences, alternatives, and rationale clearly.
2. Maintain technical accuracy without unnecessary filler or corporate throat-clearing.

### 5. Run each draft through `unslop`

Every rewritten comment and edited document must pass `unslop`:

1. **For code comments**:
   - Run the drafted comment text through `unslop` patterns: eliminate em-dash overuse, colon-as-connector, filler phrases, redundant restating, sycophancy, and AI tells.
   - Per `writing-code-comments` convention: skip document-formatting rules (rules 15, 17, 18 — boldface, heading case, emojis) since comments are inline code annotations, not markdown articles.
2. **For ADRs, READMEs, and Markdown docs**:
   - Run the mechanical audit script when available:
     ```bash
     python3 ~/.agents/skills/unslop/scripts/mechanical_audit.py "<filepath>"
     ```
   - Invoke `/unslop` or execute the 4-auditor criteria (content puffery, language jargon, structure/pacing, soul) to strip AI filler, passive voice, over-indexing on transitions, and sterile phrasing.

### 6. Verify and push

1. **Verify integrity**:
   - Check that code still typechecks and lints:
     ```bash
     pnpm lint && pnpm typecheck
     ```
   - Confirm git diff contains only clean, improved human-facing text and documentation.
2. **Commit changes**:
   - Follow repo convention: `docs: polish human-facing text and comments` or `chore: rewrite comments and docs per style guide`.
   ```bash
   git add -u
   git commit -m "docs: polish human-facing text and comments per style guide"
   ```
3. **Push back up**:
   ```bash
   git push origin HEAD
   ```
