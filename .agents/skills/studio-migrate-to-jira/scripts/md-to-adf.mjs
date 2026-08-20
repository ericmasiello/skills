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
