import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CoverageReportError,
  METRIC_STATUS,
  exitCodeFor,
  normalizeCoverageReport,
} from './normalize-coverage-report.mjs';

/**
 * Coverage gate adjudication.
 *
 * This exists because `test-quality-policy.md` defined gates that no code
 * enforced. A gate stated only in prose is a suggestion; an agent can report a
 * number and assert it passed. This compares the measured number to the gate and
 * exits non-zero when it does not clear, or when the evidence is absent.
 *
 * Policy mapping (test-quality-policy.md "Verdict Mapping"):
 *   PASS                          -> COMPLETE
 *   PASS_WITH_WARNINGS            -> COMPLETE_WITH_WARNINGS
 *   FAIL                          -> BLOCKED
 *   Missing prerequisite evidence -> BLOCKED
 */

export const EXIT_CODES = {
  OK: 0,
  CRASH: 1,
  BAD_ARGS: 2,
  MISSING_EVIDENCE: 5,
  MALFORMED: 6,
  GATE_FAILED: 7,
};

export const VERDICT = {
  PASS: 'PASS',
  PASS_WITH_WARNINGS: 'PASS_WITH_WARNINGS',
  FAIL: 'FAIL',
};

/** test-quality-policy.md is the single source for this mapping. */
export function contractResultFor(verdict, hasMissingEvidence) {
  if (hasMissingEvidence) return 'BLOCKED';
  if (verdict === VERDICT.PASS) return 'COMPLETE';
  if (verdict === VERDICT.PASS_WITH_WARNINGS) return 'COMPLETE_WITH_WARNINGS';
  return 'BLOCKED';
}

function parseGateValue(raw, label) {
  if (raw == null || raw === true || String(raw).trim() === '') return null;
  const normalized = String(raw).trim().toLowerCase();
  // An explicit not-applicable gate is legitimate: a target with no branch
  // points cannot be held to a branch threshold.
  if (normalized === 'n/a' || normalized === 'na' || normalized === 'not-applicable') return 'not-applicable';
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new CoverageReportError(
      'BAD_GATE',
      `${label} must be a number between 0 and 100, or "not-applicable". Got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

/**
 * Adjudicate one metric against its gate.
 *
 * The three metric states carry different meanings and must not collapse:
 * `measured` is compared, `not-applicable` is skipped with a note, and
 * `unreadable` is missing evidence — never a zero to fail on, and never a pass.
 */
function judgeMetric(name, metric, gate, findings) {
  if (gate == null) {
    findings.notes.push(`${name}: no gate supplied, so it was not adjudicated.`);
    return { name, gate: null, verdict: 'NOT_GATED' };
  }

  if (gate === 'not-applicable') {
    findings.notes.push(`${name}: gate explicitly marked not-applicable for this target.`);
    return { name, gate: 'not-applicable', verdict: 'NOT_APPLICABLE' };
  }

  if (metric.status === METRIC_STATUS.NOT_APPLICABLE) {
    findings.notes.push(
      `${name}: the tool reported no measurable denominator, so the ${gate}% gate is Not-Applicable (${metric.reason}).`,
    );
    return { name, gate, verdict: 'NOT_APPLICABLE', reason: metric.reason };
  }

  if (metric.status === METRIC_STATUS.UNREADABLE) {
    findings.missingEvidence.push(
      `${name}: not measurable from this report, so the ${gate}% gate cannot be adjudicated (${metric.reason}).`,
    );
    return { name, gate, verdict: 'MISSING_EVIDENCE', reason: metric.reason };
  }

  if (metric.pct == null) {
    findings.missingEvidence.push(`${name}: measured but carries no percentage, so the gate cannot be adjudicated.`);
    return { name, gate, verdict: 'MISSING_EVIDENCE' };
  }

  if (metric.pct < gate) {
    findings.blockingIssues.push(
      `${name}: ${metric.pct}% is below the ${gate}% gate${metric.total == null ? '' : ` (${metric.covered}/${metric.total})`}.`,
    );
    return { name, gate, actual: metric.pct, verdict: VERDICT.FAIL };
  }

  return { name, gate, actual: metric.pct, verdict: VERDICT.PASS };
}

/**
 * @param {{
 *   filePath?: string, content?: string, format?: string, target?: string,
 *   lineGate?: string|number, branchGate?: string|number,
 *   functionGate?: string|number, statementGate?: string|number,
 *   sourceRevision?: string, command?: string,
 * }} input
 */
export function evaluateCoverageGate(input = {}) {
  const gates = {
    lines: parseGateValue(input.lineGate, 'lineGate'),
    branches: parseGateValue(input.branchGate, 'branchGate'),
    functions: parseGateValue(input.functionGate, 'functionGate'),
    statements: parseGateValue(input.statementGate, 'statementGate'),
  };

  if (Object.values(gates).every((gate) => gate == null)) {
    throw new CoverageReportError(
      'BAD_GATE',
      'At least one gate is required (--lineGate, --branchGate, --functionGate, --statementGate). Refusing to report a pass against no gate.',
    );
  }

  const report = normalizeCoverageReport({
    filePath: input.filePath,
    content: input.content,
    format: input.format,
    target: input.target,
  });

  const findings = { missingEvidence: [], blockingIssues: [], notes: [...report.notes] };
  const judgements = Object.entries(gates).map(([name, gate]) =>
    judgeMetric(name, report.metrics[name], gate, findings),
  );

  // Evidence provenance is mandated by test-quality-policy.md; a number with no
  // command, revision or report path cannot be independently reproduced.
  if (!input.sourceRevision) {
    findings.missingEvidence.push('sourceRevision was not supplied, so this evidence cannot be tied to a revision.');
  }
  if (!input.command) {
    findings.missingEvidence.push('command was not supplied, so this evidence cannot be reproduced.');
  }
  if (!input.target) {
    findings.missingEvidence.push('target was not supplied, so this report cannot be attributed to a module.');
  }

  const gated = judgements.filter((judgement) => judgement.verdict !== 'NOT_GATED');
  const adjudicated = gated.filter(
    (judgement) => judgement.verdict === VERDICT.PASS || judgement.verdict === VERDICT.FAIL,
  );
  if (gated.length > 0 && adjudicated.length === 0) {
    findings.missingEvidence.push(
      'No gated metric could be adjudicated, so this run is missing evidence rather than passing.',
    );
  }

  const failed = judgements.some((judgement) => judgement.verdict === VERDICT.FAIL);
  const notApplicable = judgements.some((judgement) => judgement.verdict === 'NOT_APPLICABLE');
  const hasMissingEvidence = findings.missingEvidence.length > 0;

  // Missing evidence must never present as a PASS verdict.
  let verdict = VERDICT.PASS;
  if (failed || hasMissingEvidence) verdict = VERDICT.FAIL;
  else if (notApplicable) verdict = VERDICT.PASS_WITH_WARNINGS;

  return {
    verdict,
    result: contractResultFor(verdict, hasMissingEvidence),
    target: input.target ?? null,
    sourceRevision: input.sourceRevision ?? null,
    command: input.command ?? null,
    reportLocation: report.source,
    format: report.format,
    gates,
    metrics: report.metrics,
    judgements,
    missingEvidence: findings.missingEvidence,
    blockingIssues: findings.blockingIssues,
    notes: findings.notes,
  };
}

export function exitCodeForEvaluation(evaluation) {
  if (evaluation.missingEvidence.length > 0) return EXIT_CODES.MISSING_EVIDENCE;
  if (evaluation.verdict === VERDICT.FAIL) return EXIT_CODES.GATE_FAILED;
  return EXIT_CODES.OK;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next == null || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const evaluation = evaluateCoverageGate({
      filePath: typeof args.filePath === 'string' ? args.filePath : undefined,
      content: typeof args.content === 'string' ? args.content : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
      target: typeof args.target === 'string' ? args.target : undefined,
      lineGate: args.lineGate,
      branchGate: args.branchGate,
      functionGate: args.functionGate,
      statementGate: args.statementGate,
      sourceRevision: typeof args.sourceRevision === 'string' ? args.sourceRevision : undefined,
      command: typeof args.command === 'string' ? args.command : undefined,
    });
    process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
    process.exitCode = exitCodeForEvaluation(evaluation);
  } catch (error) {
    const code = error instanceof CoverageReportError ? error.code : 'UNEXPECTED_ERROR';
    process.stderr.write(
      `${JSON.stringify({ error: code, message: error.message, details: error.details ?? {} }, null, 2)}\n`,
    );
    process.exitCode = code === 'BAD_GATE' ? EXIT_CODES.BAD_ARGS : exitCodeFor(error);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
