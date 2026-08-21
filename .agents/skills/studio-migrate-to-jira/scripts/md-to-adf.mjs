#!/usr/bin/env node
/**
 * Convert GitHub-flavored Markdown (as used in GitLab work item descriptions)
 * into Atlassian Document Format (ADF) JSON, ready for
 * `acli jira workitem create --description-file <output>`.
 *
 * Why this exists: acli's --description/--description-file flags accept
 * EITHER plain text OR literal ADF JSON — they do NOT parse markdown. Passing
 * raw GitLab markdown through results in Jira storing the `##`, backticks,
 * etc. as literal plain-text characters with no rendering. Confirmed via
 * `acli jira workitem create --generate-json`, which shows the description
 * field must be `{ type: "doc", version: 1, content: [...] }`.
 *
 * Usage:
 *   node md-to-adf.mjs < input.md > output.json
 *   node md-to-adf.mjs input.md output.json
 *
 * Warnings (lossy conversions, unsupported nodes) are printed to stderr as
 * JSON — surface these to the user rather than silently dropping content.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { markdownToAdfWithWarnings } from "markdown-to-adf";

const [inputArg, outputArg] = process.argv.slice(2);

const markdown = inputArg
  ? readFileSync(inputArg, "utf8")
  : readFileSync(0, "utf8"); // stdin

const { adf, warnings } = markdownToAdfWithWarnings(markdown, {
  preset: "default",
  useHeadings: true,
  maxHeadingLevel: 6,
});

// Jira's ADF schema treats the `code` mark as mutually exclusive with other
// marks (strong, em, strike, underline, subsup, textColor) on the same text
// node. markdown-to-adf happily emits combinations like **`x`** as a single
// text node with both `code` and `strong` marks, which Jira's API rejects
// wholesale with an opaque "not valid Atlassian Document Format" error —
// confirmed by bisecting a real PRD body down to this exact pattern. Strip
// every mark but `code` whenever `code` is present so the description still
// creates successfully (code wins, matching how inline code renders anyway).
const CODE_EXCLUSIVE_MARKS = new Set([
  "em",
  "strong",
  "strike",
  "underline",
  "subsup",
  "textColor",
]);
let strippedMarkCount = 0;
function stripExclusiveCodeMarks(node) {
  if (Array.isArray(node)) {
    for (const child of node) stripExclusiveCodeMarks(child);
    return;
  }
  if (node && typeof node === "object") {
    if (
      node.type === "text" &&
      Array.isArray(node.marks) &&
      node.marks.some((m) => m.type === "code")
    ) {
      const filtered = node.marks.filter(
        (m) => !CODE_EXCLUSIVE_MARKS.has(m.type),
      );
      if (filtered.length !== node.marks.length) {
        strippedMarkCount += node.marks.length - filtered.length;
        node.marks = filtered;
      }
    }
    if (Array.isArray(node.content)) stripExclusiveCodeMarks(node.content);
  }
}
stripExclusiveCodeMarks(adf);

// This Jira instance's ADF validator rejects the `blockQuote` node type
// outright (confirmed by isolating a minimal single-paragraph blockQuote —
// fails on both Workstream and Task issue types), even though it's a
// standard ADF node. Unwrap blockquotes into their plain child content
// (usually a paragraph) rather than losing the text entirely.
let unwrappedBlockQuoteCount = 0;
function unwrapBlockQuotes(node) {
  if (node && typeof node === "object" && Array.isArray(node.content)) {
    const next = [];
    for (const child of node.content) {
      if (child && child.type === "blockQuote" && Array.isArray(child.content)) {
        unwrappedBlockQuoteCount++;
        next.push(...child.content);
      } else {
        next.push(child);
      }
    }
    node.content = next;
    for (const child of node.content) unwrapBlockQuotes(child);
  }
}
unwrapBlockQuotes(adf);

const json = JSON.stringify(adf, null, 2);

if (outputArg) {
  writeFileSync(outputArg, json + "\n");
} else {
  process.stdout.write(json + "\n");
}

if (warnings.length > 0) {
  process.stderr.write(
    `md-to-adf: ${warnings.length} conversion warning(s) — review before trusting the Jira description is complete:\n`,
  );
  process.stderr.write(JSON.stringify(warnings, null, 2) + "\n");
}

if (strippedMarkCount > 0) {
  process.stderr.write(
    `md-to-adf: stripped ${strippedMarkCount} mark(s) that Jira's ADF schema forbids combining with \`code\` (e.g. **\`x\`**) — code formatting kept, bold/italic/etc. dropped on those runs.\n`,
  );
}

if (unwrappedBlockQuoteCount > 0) {
  process.stderr.write(
    `md-to-adf: unwrapped ${unwrappedBlockQuoteCount} blockquote(s) into plain paragraphs — this Jira instance rejects the \`blockQuote\` ADF node type entirely; text is preserved but the visual quote styling is lost.\n`,
  );
}
