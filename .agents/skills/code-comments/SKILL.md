---
name: code-comments
description: Writes and improves code comments that describe things not obvious from the code, and uses commenting as a design review forcing function. Use when writing new comments, improving existing comments, reviewing comment quality, challenging API design through documentation, or when user mentions "add comments", "document this", "comment this code", "improve comments", or asks about commenting conventions. Also activates when reviewing code that lacks or has poor comments.
---

# Code Comments

Write and improve comments that describe things not obvious from the code. This applies to new code and when improving existing comments. Comments are essential for abstractions, not failures.

## Core Principle

**Comments must provide information at a DIFFERENT level of detail than the code.**

- Same level as code = repeating the code (useless)
- Lower level = adding precision (units, boundaries, invariants)
- Higher level = adding intuition (why, intent, conceptual framework)

## What to Comment (Priority Order)

1. **Every class/module/React component** — high-level abstraction: what it does, what instances represent, limitations
2. **Every function/method/hook** — behavior from caller's perspective, args, return, side effects, exceptions, preconditions
3. **Every class/instance variable and important constants** — what it represents (nouns, not verbs), units, null meaning, invariants
4. **Non-obvious implementation blocks** — why this code exists, overall intent (sparingly)
5. **Bug fixes and workarounds** — link to the ticket (Jira, GitHub issue, etc.) and explain the non-obvious condition being addressed
6. **Preconditions and side effects** — what must be true before calling, what state changes occur

## The Litmus Test

After writing a comment, ask: *Could someone write this comment just by looking at the code next to it?*
If **yes** → the comment is worthless. Rewrite or remove it.

## How to Write Each Type

### Interface Comments (classes)
Describe the abstraction, not the implementation. Include what each instance represents and any limitations.

### Interface Comments (React components)
Describe what the component renders and why. Document props with `@param`, noting required vs optional, default values, and callback signatures. Mention key behaviors (controlled vs uncontrolled, side effects on mount/unmount).

### Interface Comments (functions and methods)
1. Start with 1-2 sentences of caller-visible behavior (higher-level)
2. Document each arg and return value precisely (lower-level)
3. List side effects, exceptions, and preconditions
4. For hooks: document what triggers re-renders, cleanup behavior, and dependency expectations

### Bug Fixes and Workarounds
When fixing a non-obvious bug or working around a quirk, comment **why** the fix is needed. Include a link to the ticket or context source. Ask the user for a Jira/GitHub/Slack link if they don't provide one.

```typescript
// Debounce resize handler to avoid layout thrashing on Safari.
// See: https://jira.example.com/browse/FE-1234
```

### Variable Comments
- Focus on what the variable **represents**, not how it's manipulated
- Specify: units, inclusive/exclusive boundaries, null semantics, invariants, cleanup responsibility
- Use different words than the variable name

### Implementation Comments
- Describe **why** and **what** at a high level, not **how**
- Ask: "What is this code trying to do?" — write that, not a line-by-line narration

## Red Flags

- [ ] Comment uses the same words as the entity name
- [ ] One comment per line of code, each describing that line
- [ ] Comment could be written without understanding the code
- [ ] Variable comment describes how it's toggled rather than what it means
- [ ] Comment restates the condition in an `if` statement

## Conventions

- **TypeScript**: Use [TSDoc](https://tsdoc.org/) (`/** */` blocks with `@param`, `@returns`, `@throws`, `@remarks`, `@example`, etc.)
- **JavaScript**: Use JSDoc
- **Other languages**: Follow their doc tools (Javadoc, Doxygen, godoc, rustdoc, etc.)
- When no convention exists, adopt one from a similar project and be consistent
- Keep comments close to the code they describe (reduces staleness)
- Avoid duplicated documentation across locations

### TSDoc Quick Reference

Use `/** */` blocks with: `@param`, `@returns`, `@throws`, `@remarks`, `@example`, `@defaultValue`, `@see`.

See [REFERENCE.md](REFERENCE.md) for the full TSDoc template and tag descriptions.

## Comments as Design Review

Writing comments is a forcing function for better design. When documenting new code, actively challenge:

- **Module depth** — if the interface comment is as complex as the implementation, the module is shallow
- **Parameter necessity** — should it be optional or required? Can the type be narrower (branded types, unions)?
- **Type-level enforcement** — before writing "must be X", ask if TypeScript can enforce it instead
- **Design smells** — too many `@param`, hedging language ("usually"), conditional behavior descriptions

See [REFERENCE.md](REFERENCE.md) for detailed good/bad examples and design review patterns.
