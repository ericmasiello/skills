import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Mutation gate adjudication.
 *
 * `test-quality-policy.md` requires a mutation score, an eligible-mutant
 * denominator, survivor classification, and full provenance. None of it was
 * enforced by code, so a run that generated three valid mutants after 197
 * compile errors could report 100% and pass.
 *
 * This evaluator refuses three specific laundering routes:
 *   1. zero eligible mutants reported as a pass
 *   2. a score computed over a denominator wrecked by compile errors
 *   3. survivors dismissed as "equivalent" with no recorded classification
 */

export const EXIT_CODES = {
  OK: 0,
  CRASH: 1,
  BAD_ARGS: 2,
  REPORT_NOT_FOUND: 4,
  MISSING_EVIDENCE: 5,
  MALFORMED: 6,
  GATE_FAILED: 7,
};

export const VERDICT = { PASS: 'PASS', PASS_WITH_WARNINGS: 'PASS_WITH_WARNINGS', FAIL: 'FAIL' };

/** Valid survivor classifications, per test-quality-policy.md. */
export const SURVIVOR_CLASSIFICATIONS = new Set(['test gap', 'equivalent mutant', 'deferred']);

export class MutationReportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MutationReportError';
    this.code = code;
    this.details = details;
  }
}

const CODE_TO_EXIT = {
  BAD_ARGS: EXIT_CODES.BAD_ARGS,
  REPORT_NOT_FOUND: EXIT_CODES.REPORT_NOT_FOUND,
  EMPTY_REPORT: EXIT_CODES.MISSING_EVIDENCE,
  MALFORMED_REPORT: EXIT_CODES.MALFORMED,
  UNSUPPORTED_FORMAT: EXIT_CODES.BAD_ARGS,
};

/**
 * Mutant status taxonomy, following the mutation-testing-elements schema that
 * Stryker-JS and Stryker.NET both emit.
 *
 * detected  = the tests caught it
 * undetected= the tests did not catch it; NoCoverage counts here, because a
 *             mutant on an unexercised line is precisely an untested behaviour
 * invalid   = the mutant never ran, so it belongs in neither numerator nor
 *             denominator, and a large share of these invalidates the score
 */
const DETECTED = new Set(['killed', 'timeout']);
const UNDETECTED = new Set(['survived', 'nocoverage', 'no_coverage']);
const INVALID = new Set(['compileerror', 'compile_error', 'runtimeerror', 'runtime_error', 'ignored', 'skipped']);

function classifyStatus(rawStatus) {
  const status = String(rawStatus ?? '').toLowerCase().replace(/[\s-]/g, '');
  if (DETECTED.has(status)) return 'detected';
  if (UNDETECTED.has(status)) return 'undetected';
  if (INVALID.has(status)) return 'invalid';
  return 'unknown';
}

function emptyTally() {
  return {
    detected: 0,
    undetected: 0,
    invalid: 0,
    unknown: 0,
    timeout: 0,
    noCoverage: 0,
    byStatus: {},
    survivors: [],
    files: [],
  };
}

function recordMutant(tally, { status, file, id, location, mutator }) {
  const normalized = String(status ?? '').toLowerCase().replace(/[\s-]/g, '');
  tally.byStatus[status] = (tally.byStatus[status] ?? 0) + 1;
  const bucket = classifyStatus(status);
  tally[bucket] += 1;
  if (normalized === 'timeout') tally.timeout += 1;
  if (normalized === 'nocoverage' || normalized === 'no_coverage') tally.noCoverage += 1;
  if (bucket === 'undetected') {
    tally.survivors.push({
      id: id ?? `${file ?? 'unknown'}:${location ?? '?'}`,
      file: file ?? null,
      location: location ?? null,
      mutator: mutator ?? null,
      status,
    });
  }
}

/** Stryker-JS and Stryker.NET JSON (mutation-testing-elements schema). */
function parseStrykerJson(parsed, tally) {
  const files = parsed.files ?? {};
  for (const [file, entry] of Object.entries(files)) {
    tally.files.push(file);
    for (const mutant of entry.mutants ?? []) {
      recordMutant(tally, {
        status: mutant.status,
        file,
        id: mutant.id,
        location: mutant.location?.start ? `${mutant.location.start.line}:${mutant.location.start.column}` : null,
        mutator: mutant.mutatorName,
      });
    }
  }
  // Some Stryker versions place unparsed files under a separate key.
  for (const [file, entry] of Object.entries(parsed.testFiles ?? {})) {
    if (entry?.mutants) tally.files.push(file);
  }
}

/** cargo-mutants outcomes.json */
function parseCargoMutants(parsed, tally) {
  for (const outcome of parsed.outcomes ?? []) {
    const summary = String(outcome.summary ?? '').toLowerCase();
    const status =
      summary === 'missedmutant' || summary === 'missed'
        ? 'Survived'
        : summary === 'caughtmutant' || summary === 'caught'
          ? 'Killed'
          : summary === 'timeout'
            ? 'Timeout'
            : summary === 'unviable'
              ? 'CompileError'
              : outcome.summary;
    recordMutant(tally, {
      status,
      file: outcome.scenario?.Mutant?.file ?? null,
      id: outcome.scenario?.Mutant?.function ?? null,
      location: outcome.scenario?.Mutant?.line ?? null,
      mutator: outcome.scenario?.Mutant?.replacement ?? null,
    });
  }
}

/** PIT mutations.xml */
function parsePitXml(text, tally) {
  const mutations = [...text.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/gi)];
  if (mutations.length === 0) {
    throw new MutationReportError('EMPTY_REPORT', 'PIT XML report contains no <mutation> elements.');
  }
  for (const [, attributes, body] of mutations) {
    const status = attributes.match(/status="([^"]+)"/i)?.[1] ?? 'UNKNOWN';
    const file = body.match(/<sourceFile>([^<]*)<\/sourceFile>/i)?.[1] ?? null;
    const method = body.match(/<mutatedMethod>([^<]*)<\/mutatedMethod>/i)?.[1] ?? null;
    const line = body.match(/<lineNumber>([^<]*)<\/lineNumber>/i)?.[1] ?? null;
    const mutator = body.match(/<mutator>([^<]*)<\/mutator>/i)?.[1] ?? null;
    if (file && !tally.files.includes(file)) tally.files.push(file);
    // PIT: KILLED/TIMED_OUT are detected; SURVIVED/NO_COVERAGE are not;
    // NON_VIABLE/MEMORY_ERROR/RUN_ERROR never produced a verdict.
    const mapped =
      { KILLED: 'Killed', TIMED_OUT: 'Timeout', SURVIVED: 'Survived', NO_COVERAGE: 'NoCoverage', NON_VIABLE: 'CompileError', MEMORY_ERROR: 'RuntimeError', RUN_ERROR: 'RuntimeError' }[
        status.toUpperCase()
      ] ?? status;
    recordMutant(tally, { status: mapped, file, id: method, location: line, mutator });
  }
}

/** mutmut text results, e.g. "Survived 🙁 (3)" followed by ids. */
function parseMutmutText(text, tally) {
  const sections = [...text.matchAll(/^([A-Za-z ]+?)\s*[^\S\n]*(?:\p{Emoji_Presentation}|\p{So})?\s*\((\d+)\)\s*$/gmu)];
  if (sections.length === 0) {
    throw new MutationReportError(
      'UNSUPPORTED_FORMAT',
      'Could not parse mutmut text output. Export a machine-readable report (mutmut junitxml) or pass --format stryker-json.',
    );
  }
  const map = {
    killed: 'Killed',
    timeout: 'Timeout',
    survived: 'Survived',
    'no tests': 'NoCoverage',
    suspicious: 'RuntimeError',
    untested: 'NoCoverage',
  };
  for (const [, label, count] of sections) {
    const key = label.trim().toLowerCase();
    const status = map[key];
    if (!status) continue;
    for (let index = 0; index < Number(count); index += 1) {
      recordMutant(tally, { status, file: null, id: `${key}-${index + 1}`, location: null, mutator: null });
    }
  }
}

function inferFormat(filePath, raw) {
  const extension = filePath ? extname(filePath).toLowerCase() : '';
  const trimmed = raw.trim();
  if (extension === '.xml' || /<mutations?\b/i.test(trimmed)) return 'pit-xml';
  if (extension === '.json' || trimmed.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new MutationReportError(
        'MALFORMED_REPORT',
        `Mutation report is not valid JSON (truncated or partially written?): ${error.message}`,
      );
    }
    if (parsed.outcomes) return 'cargo-mutants-json';
    if (parsed.files) return 'stryker-json';
    throw new MutationReportError(
      'UNSUPPORTED_FORMAT',
      'Unsupported JSON mutation report. Expected a Stryker (mutation-testing-elements) report or cargo-mutants outcomes.json.',
    );
  }
  if (/killed|survived/i.test(trimmed)) return 'mutmut-text';
  throw new MutationReportError(
    'UNSUPPORTED_FORMAT',
    'Could not identify the mutation report format. Pass --format (stryker-json, pit-xml, cargo-mutants-json, mutmut-text).',
  );
}

function loadReport(filePath, content) {
  if (content != null) {
    if (content.trim() === '') {
      throw new MutationReportError('EMPTY_REPORT', 'Mutation report content was supplied but is empty.');
    }
    return { source: 'inline-content', raw: content };
  }
  if (!filePath) {
    throw new MutationReportError('BAD_ARGS', 'A mutation report is required: pass --filePath or --content.');
  }
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new MutationReportError(
      'REPORT_NOT_FOUND',
      `No mutation report exists at "${resolved}". The mutation run may not have produced one, or it aborted before writing.`,
      { path: resolved },
    );
  }
  const raw = readFileSync(resolved, 'utf8');
  if (raw.trim() === '') {
    throw new MutationReportError(
      'EMPTY_REPORT',
      `The mutation report at "${resolved}" is empty. The run produced no data.`,
      { path: resolved },
    );
  }
  return { source: resolved, raw };
}

function parseTriage(raw) {
  if (raw == null) return null;
  let parsed;
  try {
    parsed = typeof raw === 'string' && raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(readFileSync(resolve(raw), 'utf8'));
  } catch (error) {
    throw new MutationReportError('BAD_ARGS', `Could not read the survivor triage file: ${error.message}`);
  }
  const entries = Object.entries(parsed);
  const invalid = entries.filter(([, classification]) => !SURVIVOR_CLASSIFICATIONS.has(String(classification).toLowerCase()));
  if (invalid.length > 0) {
    throw new MutationReportError(
      'BAD_ARGS',
      `Survivor triage contains invalid classification(s): ${invalid.map(([id, value]) => `${id}="${value}"`).join(', ')}. Allowed values are: ${[...SURVIVOR_CLASSIFICATIONS].join(', ')}.`,
    );
  }
  return new Map(entries.map(([id, classification]) => [id, String(classification).toLowerCase()]));
}

/**
 * @param {{
 *   filePath?: string, content?: string, format?: string,
 *   gate?: string|number, target?: string, sourceRevision?: string, command?: string,
 *   triage?: string, allowUntriagedSurvivors?: boolean,
 *   maxInvalidRatio?: string|number,
 * }} input
 */
export function evaluateMutationReport(input = {}) {
  const gate = input.gate == null || input.gate === true ? 85 : Number(input.gate);
  if (!Number.isFinite(gate) || gate < 0 || gate > 100) {
    throw new MutationReportError('BAD_ARGS', `gate must be a number between 0 and 100, got ${JSON.stringify(input.gate)}.`);
  }
  const maxInvalidRatio =
    input.maxInvalidRatio == null || input.maxInvalidRatio === true ? 0.2 : Number(input.maxInvalidRatio);
  if (!Number.isFinite(maxInvalidRatio) || maxInvalidRatio < 0 || maxInvalidRatio > 1) {
    throw new MutationReportError('BAD_ARGS', 'maxInvalidRatio must be a number between 0 and 1.');
  }

  const { source, raw } = loadReport(input.filePath, input.content);
  const format = input.format ?? inferFormat(input.filePath, raw);
  const tally = emptyTally();

  switch (format) {
    case 'stryker-json':
      parseStrykerJson(JSON.parse(raw), tally);
      break;
    case 'cargo-mutants-json':
      parseCargoMutants(JSON.parse(raw), tally);
      break;
    case 'pit-xml':
      parsePitXml(raw, tally);
      break;
    case 'mutmut-text':
      parseMutmutText(raw, tally);
      break;
    default:
      throw new MutationReportError('UNSUPPORTED_FORMAT', `Unsupported mutation report format: ${format}`);
  }

  const eligible = tally.detected + tally.undetected;
  const attempted = eligible + tally.invalid + tally.unknown;
  const missingEvidence = [];
  const blockingIssues = [];
  const notes = [];

  // Route 1: zero eligible mutants is Missing Evidence, never a pass.
  if (eligible === 0) {
    missingEvidence.push(
      `Zero eligible mutants (${attempted} attempted, ${tally.invalid} invalid, ${tally.unknown} unknown status). A mutation score cannot be computed, so this is Missing Evidence, not a pass.`,
    );
  }

  // Route 2: a denominator wrecked by compile errors makes the score meaningless.
  const invalidRatio = attempted === 0 ? 0 : tally.invalid / attempted;
  if (eligible > 0 && invalidRatio > maxInvalidRatio) {
    missingEvidence.push(
      `${tally.invalid} of ${attempted} attempted mutants were invalid (${Math.round(invalidRatio * 1000) / 10}%), above the ${Math.round(maxInvalidRatio * 1000) / 10}% limit. The surviving denominator is too small to trust; the test project probably failed to compile. Interpreting only the valid outcomes would overstate the score.`,
    );
  }

  if (tally.unknown > 0) {
    missingEvidence.push(
      `${tally.unknown} mutant(s) carry an unrecognised status (${Object.keys(tally.byStatus).join(', ')}); they were excluded from the denominator rather than assumed killed.`,
    );
  }

  const score = eligible === 0 ? null : Math.round((tally.detected / eligible) * 10000) / 100;

  // Provenance, mandated by test-quality-policy.md.
  if (!input.target) missingEvidence.push('target was not supplied, so this score cannot be attributed to a module.');
  if (!input.sourceRevision) missingEvidence.push('sourceRevision was not supplied, so this score is not tied to a revision.');
  if (!input.command) missingEvidence.push('command was not supplied, so this score cannot be reproduced.');

  // Route 3: survivors must each carry a classification.
  const triage = parseTriage(input.triage);
  const untriaged = [];
  if (tally.survivors.length > 0) {
    if (triage == null) {
      if (input.allowUntriagedSurvivors !== true) {
        missingEvidence.push(
          `${tally.survivors.length} surviving mutant(s) have no classification. Supply --triage with "test gap", "equivalent mutant" or "deferred" per survivor, or pass --allowUntriagedSurvivors to record the gap explicitly.`,
        );
      } else {
        notes.push(`${tally.survivors.length} survivor(s) were accepted untriaged by explicit request.`);
      }
    } else {
      for (const survivor of tally.survivors) {
        if (!triage.has(String(survivor.id))) untriaged.push(survivor.id);
      }
      if (untriaged.length > 0) {
        missingEvidence.push(
          `${untriaged.length} surviving mutant(s) are absent from the triage file: ${untriaged.slice(0, 5).join(', ')}.`,
        );
      }
    }
  }

  if (tally.timeout > 0) {
    notes.push(
      `${tally.timeout} mutant(s) timed out and were counted as detected. Confirm the timeout is not masking a slow test.`,
    );
  }
  if (tally.noCoverage > 0) {
    notes.push(`${tally.noCoverage} mutant(s) were on lines with no test coverage and count as survivors.`);
  }

  if (score != null && score < gate) {
    blockingIssues.push(`Mutation score ${score}% is below the ${gate}% gate (${tally.detected}/${eligible} detected).`);
  }

  const hasMissingEvidence = missingEvidence.length > 0;
  // Missing evidence must never present as a PASS verdict. A score computed over
  // a wrecked denominator is not a passing score, it is an unusable one.
  let verdict = VERDICT.PASS;
  if (score == null || score < gate || hasMissingEvidence) verdict = VERDICT.FAIL;
  else if (notes.length > 0) verdict = VERDICT.PASS_WITH_WARNINGS;

  return {
    verdict,
    result: hasMissingEvidence ? 'BLOCKED' : verdict === VERDICT.PASS ? 'COMPLETE' : verdict === VERDICT.PASS_WITH_WARNINGS ? 'COMPLETE_WITH_WARNINGS' : 'BLOCKED',
    format,
    reportLocation: source,
    target: input.target ?? null,
    sourceRevision: input.sourceRevision ?? null,
    command: input.command ?? null,
    gate,
    score,
    // The full evidence contract required by test-quality-policy.md.
    mutants: {
      attempted,
      eligible,
      detected: tally.detected,
      undetected: tally.undetected,
      invalid: tally.invalid,
      unknown: tally.unknown,
      timeout: tally.timeout,
      noCoverage: tally.noCoverage,
      byStatus: tally.byStatus,
    },
    invalidRatio: Math.round(invalidRatio * 10000) / 10000,
    survivors: tally.survivors,
    untriagedSurvivors: untriaged,
    files: tally.files,
    missingEvidence,
    blockingIssues,
    notes,
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
    const evaluation = evaluateMutationReport({
      filePath: typeof args.filePath === 'string' ? args.filePath : undefined,
      content: typeof args.content === 'string' ? args.content : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
      gate: args.gate,
      target: typeof args.target === 'string' ? args.target : undefined,
      sourceRevision: typeof args.sourceRevision === 'string' ? args.sourceRevision : undefined,
      command: typeof args.command === 'string' ? args.command : undefined,
      triage: typeof args.triage === 'string' ? args.triage : undefined,
      allowUntriagedSurvivors: args.allowUntriagedSurvivors === true,
      maxInvalidRatio: args.maxInvalidRatio,
    });
    process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
    process.exitCode = exitCodeForEvaluation(evaluation);
  } catch (error) {
    const code = error instanceof MutationReportError ? error.code : 'UNEXPECTED_ERROR';
    process.stderr.write(
      `${JSON.stringify({ error: code, message: error.message, details: error.details ?? {} }, null, 2)}\n`,
    );
    process.exitCode = CODE_TO_EXIT[code] ?? EXIT_CODES.CRASH;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
