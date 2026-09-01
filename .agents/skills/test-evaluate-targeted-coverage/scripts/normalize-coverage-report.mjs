import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Exit-code taxonomy. A caller must be able to tell "measured and clean" from
 * "measured but unusable" from "crashed" without parsing stdout.
 */
export const EXIT_CODES = {
  OK: 0,
  CRASH: 1,
  BAD_ARGS: 2,
  NOT_FOUND: 4,
  NOTHING_MEASURABLE: 5,
  MALFORMED: 6,
};

const CODE_TO_EXIT = {
  MISSING_INPUT: EXIT_CODES.BAD_ARGS,
  UNSUPPORTED_FORMAT: EXIT_CODES.BAD_ARGS,
  REPORT_NOT_FOUND: EXIT_CODES.NOT_FOUND,
  TARGET_NOT_IN_REPORT: EXIT_CODES.NOT_FOUND,
  EMPTY_REPORT: EXIT_CODES.NOTHING_MEASURABLE,
  NOTHING_MEASURABLE: EXIT_CODES.NOTHING_MEASURABLE,
  MALFORMED_REPORT: EXIT_CODES.MALFORMED,
  INCONSISTENT_METRIC: EXIT_CODES.MALFORMED,
};

export class CoverageReportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CoverageReportError';
    this.code = code;
    this.details = details;
  }
}

export function exitCodeFor(error) {
  if (error instanceof CoverageReportError) {
    return CODE_TO_EXIT[error.code] ?? EXIT_CODES.CRASH;
  }
  return EXIT_CODES.CRASH;
}

/**
 * A metric is in exactly one of three states. Conflating the last two is how an
 * unreadable report becomes a Not-Applicable gate waiver, so they are distinct.
 *
 * - `measured`        the tool reported a usable denominator and numerator
 * - `not-applicable`  the tool legitimately reported no denominator (e.g. no branch points)
 * - `unreadable`      this format cannot express the metric, or the input was corrupt
 */
export const METRIC_STATUS = {
  MEASURED: 'measured',
  NOT_APPLICABLE: 'not-applicable',
  UNREADABLE: 'unreadable',
};

function roundPct(value) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function buildMetric(status, { covered = null, total = null, pct = null, reason = null }) {
  return {
    covered,
    total,
    pct,
    // Retained for backward compatibility: `supported` is true only when measured.
    supported: status === METRIC_STATUS.MEASURED,
    status,
    reason,
  };
}

function notApplicableMetric(reason) {
  return buildMetric(METRIC_STATUS.NOT_APPLICABLE, { reason });
}

function unreadableMetric(reason) {
  return buildMetric(METRIC_STATUS.UNREADABLE, { reason });
}

/**
 * Build a measured metric, enforcing the invariants that make a coverage number
 * physically possible. A violation is a corrupt report, never a silent value.
 */
function measuredMetric(label, { covered = null, total = null, pct = null }, notes = []) {
  const hasCounts = covered != null || total != null;

  if (hasCounts) {
    if (!Number.isFinite(total)) {
      throw new CoverageReportError(
        'INCONSISTENT_METRIC',
        `${label}: denominator is not a finite number (got ${JSON.stringify(total)}). The report is corrupt or truncated.`,
        { label, covered, total },
      );
    }
    if (total < 0) {
      throw new CoverageReportError(
        'INCONSISTENT_METRIC',
        `${label}: denominator is negative (${total}).`,
        { label, covered, total },
      );
    }
    if (total === 0) {
      return notApplicableMetric(`${label}: the tool reported a zero denominator`);
    }
    if (covered != null) {
      if (!Number.isFinite(covered)) {
        throw new CoverageReportError(
          'INCONSISTENT_METRIC',
          `${label}: numerator is not a finite number (got ${JSON.stringify(covered)}). The report is corrupt or truncated.`,
          { label, covered, total },
        );
      }
      if (covered < 0) {
        throw new CoverageReportError(
          'INCONSISTENT_METRIC',
          `${label}: numerator is negative (${covered}).`,
          { label, covered, total },
        );
      }
      if (covered > total) {
        throw new CoverageReportError(
          'INCONSISTENT_METRIC',
          `${label}: covered ${covered} exceeds total ${total}. Coverage above 100% is impossible; the report is corrupt, truncated, or double-counted.`,
          { label, covered, total },
        );
      }
    }
  }

  let resolvedPct = pct;
  if (resolvedPct == null && covered != null && total) {
    resolvedPct = (covered / total) * 100;
  }

  if (resolvedPct != null) {
    if (!Number.isFinite(resolvedPct)) {
      throw new CoverageReportError(
        'INCONSISTENT_METRIC',
        `${label}: percentage is not a finite number (got ${JSON.stringify(pct)}).`,
        { label, pct },
      );
    }
    if (resolvedPct < 0 || resolvedPct > 100) {
      throw new CoverageReportError(
        'INCONSISTENT_METRIC',
        `${label}: percentage ${resolvedPct} is outside 0-100. The report is corrupt or the units are not percentages.`,
        { label, pct: resolvedPct },
      );
    }
  }

  if (pct != null && covered != null && total) {
    const derived = (covered / total) * 100;
    if (Math.abs(derived - pct) > 0.5) {
      notes.push(
        `${label}: reported percentage ${roundPct(pct)}% disagrees with counts ${covered}/${total} (${roundPct(derived)}%); counts were used.`,
      );
      // Safe without re-validation: the covered <= total and total > 0 guards
      // above already bound the derived value to 0-100.
      resolvedPct = derived;
    }
  }

  if (!hasCounts && resolvedPct == null) {
    return unreadableMetric(`${label}: this report contains neither counts nor a percentage`);
  }

  return buildMetric(METRIC_STATUS.MEASURED, {
    covered: covered ?? null,
    total: total ?? null,
    pct: roundPct(resolvedPct),
  });
}

function intOrThrow(raw, label) {
  const value = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(value)) {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      `${label}: expected an integer, got ${JSON.stringify(raw)}.`,
      { label, raw },
    );
  }
  return value;
}

function baseNormalized(format, source) {
  return {
    format,
    source,
    target: null,
    metrics: {
      lines: unreadableMetric('not parsed'),
      branches: unreadableMetric('not parsed'),
      functions: unreadableMetric('not parsed'),
      statements: unreadableMetric('not parsed'),
    },
    files: [],
    notes: [],
  };
}

function normalizeIstanbulSummary(parsed, source) {
  const normalized = baseNormalized('istanbul-summary-json', source);
  const total = parsed.total ?? parsed;

  const readSlot = (slot, label) => {
    if (!total[slot]) {
      return unreadableMetric(`${label}: absent from this Istanbul summary`);
    }
    return measuredMetric(label, {
      covered: total[slot].covered ?? null,
      total: total[slot].total ?? null,
      pct: total[slot].pct ?? null,
    }, normalized.notes);
  };

  normalized.metrics.lines = readSlot('lines', 'lines');
  normalized.metrics.branches = readSlot('branches', 'branches');
  normalized.metrics.functions = readSlot('functions', 'functions');
  normalized.metrics.statements = readSlot('statements', 'statements');

  normalized.files = Object.keys(parsed).filter((key) => key !== 'total');
  return normalized;
}

/**
 * LCOV, keyed per source file.
 *
 * Accumulating counters blindly across an LCOV file double-counts every repeated
 * `SF:` section, which is what `cat *.info > merged.info` produces. Per-file
 * records also let a truncated report be detected: a record opened by `SF:` and
 * never closed by `end_of_record` means the writer was interrupted.
 */
function normalizeLcov(text, source) {
  const normalized = baseNormalized('lcov', source);
  const records = new Map();
  let current = null;
  let openPath = null;

  const startRecord = (path) => {
    if (!records.has(path)) {
      records.set(path, {
        lf: null,
        lh: null,
        brf: null,
        brh: null,
        fnf: null,
        fnh: null,
        lineHits: new Map(),
        branchHits: new Map(),
        functionHits: new Map(),
      });
    }
    return records.get(path);
  };

  const takeMax = (record, key, value) => {
    record[key] = record[key] == null ? value : Math.max(record[key], value);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;

    if (line.startsWith('SF:')) {
      openPath = line.slice(3).trim();
      current = startRecord(openPath);
      continue;
    }
    if (line === 'end_of_record') {
      current = null;
      openPath = null;
      continue;
    }
    if (current == null) continue;

    if (line.startsWith('LF:')) takeMax(current, 'lf', intOrThrow(line.slice(3), `lcov LF for ${openPath}`));
    else if (line.startsWith('LH:')) takeMax(current, 'lh', intOrThrow(line.slice(3), `lcov LH for ${openPath}`));
    else if (line.startsWith('BRF:')) takeMax(current, 'brf', intOrThrow(line.slice(4), `lcov BRF for ${openPath}`));
    else if (line.startsWith('BRH:')) takeMax(current, 'brh', intOrThrow(line.slice(4), `lcov BRH for ${openPath}`));
    else if (line.startsWith('FNF:')) takeMax(current, 'fnf', intOrThrow(line.slice(4), `lcov FNF for ${openPath}`));
    else if (line.startsWith('FNH:')) takeMax(current, 'fnh', intOrThrow(line.slice(4), `lcov FNH for ${openPath}`));
    else if (line.startsWith('DA:')) {
      const [lineNumber, hits] = line.slice(3).split(',');
      const key = String(lineNumber).trim();
      const value = intOrThrow(hits ?? '0', `lcov DA for ${openPath}`);
      current.lineHits.set(key, Math.max(current.lineHits.get(key) ?? 0, value));
    } else if (line.startsWith('BRDA:')) {
      const parts = line.slice(5).split(',');
      const key = parts.slice(0, 3).join(',');
      const takenRaw = (parts[3] ?? '-').trim();
      const value = takenRaw === '-' ? 0 : intOrThrow(takenRaw, `lcov BRDA for ${openPath}`);
      current.branchHits.set(key, Math.max(current.branchHits.get(key) ?? 0, value));
    } else if (line.startsWith('FNDA:')) {
      const [hits, name] = line.slice(5).split(',');
      const key = String(name ?? '').trim();
      const value = intOrThrow(hits ?? '0', `lcov FNDA for ${openPath}`);
      current.functionHits.set(key, Math.max(current.functionHits.get(key) ?? 0, value));
    } else if (line.startsWith('FN:')) {
      const [, name] = line.slice(3).split(',');
      const key = String(name ?? '').trim();
      if (!current.functionHits.has(key)) current.functionHits.set(key, 0);
    }
  }

  if (openPath != null) {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      `lcov report is truncated: the record for "${openPath}" has no "end_of_record" terminator. The coverage writer did not finish.`,
      { unterminatedRecord: openPath },
    );
  }

  if (records.size === 0) {
    throw new CoverageReportError(
      'EMPTY_REPORT',
      'lcov report contains no "SF:" records. The coverage run produced no data.',
    );
  }

  const totals = { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
  let anyLine = false;
  let anyBranch = false;
  let anyFunction = false;

  for (const record of records.values()) {
    // Per-line detail is authoritative when present; it merges repeated runs exactly.
    if (record.lineHits.size > 0) {
      totals.lf += record.lineHits.size;
      totals.lh += [...record.lineHits.values()].filter((hits) => hits > 0).length;
      anyLine = true;
    } else if (record.lf != null) {
      totals.lf += record.lf;
      totals.lh += record.lh ?? 0;
      anyLine = true;
    }

    if (record.branchHits.size > 0) {
      totals.brf += record.branchHits.size;
      totals.brh += [...record.branchHits.values()].filter((taken) => taken > 0).length;
      anyBranch = true;
    } else if (record.brf != null) {
      totals.brf += record.brf;
      totals.brh += record.brh ?? 0;
      anyBranch = true;
    }

    if (record.functionHits.size > 0) {
      totals.fnf += record.functionHits.size;
      totals.fnh += [...record.functionHits.values()].filter((hits) => hits > 0).length;
      anyFunction = true;
    } else if (record.fnf != null) {
      totals.fnf += record.fnf;
      totals.fnh += record.fnh ?? 0;
      anyFunction = true;
    }
  }

  normalized.metrics.lines = anyLine
    ? measuredMetric('lines', { covered: totals.lh, total: totals.lf }, normalized.notes)
    : unreadableMetric('lines: no LF/LH counters and no DA records');
  normalized.metrics.branches = anyBranch
    ? measuredMetric('branches', { covered: totals.brh, total: totals.brf }, normalized.notes)
    : notApplicableMetric('branches: this lcov report contains no branch records');
  normalized.metrics.functions = anyFunction
    ? measuredMetric('functions', { covered: totals.fnh, total: totals.fnf }, normalized.notes)
    : unreadableMetric('functions: no FNF/FNH counters and no FN/FNDA records');
  normalized.metrics.statements = unreadableMetric(
    'statements: LCOV does not report statements separately; line coverage is the closest available metric',
  );

  normalized.files = [...records.keys()];
  normalized.notes.push(
    `Aggregated ${records.size} lcov source record(s); repeated records for one file were merged, not summed.`,
  );
  return normalized;
}

function normalizeTextSummary(text, source) {
  const normalized = baseNormalized('text-summary', source);
  const lines = text.split(/\r?\n/);
  const totalLine = lines.find(
    (line) => /^TOTAL\s+/i.test(line.trim()) || /^All files\s*\|/i.test(line.trim()),
  );

  if (!totalLine) {
    throw new CoverageReportError(
      'EMPTY_REPORT',
      'Could not find a TOTAL or "All files" summary line in the text coverage report.',
    );
  }

  const pytestHeader = lines.find((line) =>
    /^Name\s+Stmts\s+Miss(?:\s+Branch\s+BrPart)?\s+Cover/i.test(line.trim()),
  );
  if (pytestHeader && /^TOTAL\s+/i.test(totalLine.trim())) {
    const values = [...totalLine.matchAll(/(\d+(?:\.\d+)?)(?:%)?/g)].map((match) =>
      Number.parseFloat(match[1]),
    );
    const hasBranchColumns = /\bBranch\s+BrPart\b/i.test(pytestHeader);
    const expectedValueCount = hasBranchColumns ? 5 : 3;
    if (values.length < expectedValueCount) {
      throw new CoverageReportError('MALFORMED_REPORT', 'pytest-cov TOTAL summary is incomplete.');
    }
    const [statements, missed] = values;
    const coveragePercent = values[hasBranchColumns ? 4 : 2];
    const covered = statements - missed;
    normalized.metrics.statements = measuredMetric(
      'statements',
      { covered, total: statements },
      normalized.notes,
    );
    normalized.metrics.lines = measuredMetric('lines', { covered, total: statements }, normalized.notes);
    normalized.metrics.branches = notApplicableMetric(
      'branches: pytest-cov text summaries do not carry branch counts; run "coverage json" for branch data',
    );
    normalized.metrics.functions = unreadableMetric(
      'functions: pytest-cov text summaries do not report function coverage',
    );
    normalized.notes.push(
      `pytest-cov combined coverage is ${coveragePercent}%; run coverage json for branch counts.`,
    );
    normalized.notes.push(
      'coverage.py measures executable statements by line, so "lines" and "statements" are the same measurement here.',
    );
    return normalized;
  }

  const percentages = [...totalLine.matchAll(/(\d+(?:\.\d+)?)(?:%)?/g)].map((match) =>
    Number.parseFloat(match[1]),
  );
  if (percentages.length < 4) {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      'Text coverage summary must contain statements, branches, functions, and lines percentages.',
    );
  }

  normalized.metrics.statements = measuredMetric('statements', { pct: percentages[0] }, normalized.notes);
  normalized.metrics.branches = measuredMetric('branches', { pct: percentages[1] }, normalized.notes);
  normalized.metrics.functions = measuredMetric('functions', { pct: percentages[2] }, normalized.notes);
  normalized.metrics.lines = measuredMetric('lines', { pct: percentages[3] }, normalized.notes);

  normalized.notes.push(
    'Covered/total counts are not available from a text summary, so this report cannot be statement-weighted.',
  );
  return normalized;
}

/**
 * Decide whether a report entry belongs to the requested target.
 *
 * coverage.py reports every file it imported, including the test module, so an
 * unscoped aggregate mixes test coverage into production coverage and inflates
 * the number. Filtering to the target is what makes the figure mean what the
 * gate assumes it means.
 */
function matchesTarget(path, target) {
  if (target == null || target === '') return true;
  const candidate = String(path).replace(/\\/g, '/');
  const wanted = String(target).replace(/\\/g, '/');
  return candidate.includes(wanted) || wanted.includes(candidate);
}

/** Test files are never production coverage evidence. */
function looksLikeTestFile(path) {
  const candidate = String(path).replace(/\\/g, '/');
  return (
    /(^|\/)(tests?|spec|specs|__tests__)\//i.test(candidate) ||
    /(^|\/)(test_[^/]+|conftest)\.py$/i.test(candidate) ||
    /[._-](test|spec)\.[^./]+$/i.test(candidate) ||
    /Tests?\.(cs|java|kt)$/i.test(candidate)
  );
}

function normalizeCoveragePyJson(parsed, source, target) {
  const normalized = baseNormalized('coverage-py-json', source);
  if (parsed.files == null || typeof parsed.files !== 'object') {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      'coverage.py JSON report has no "files" object. Run "coverage json" and pass its output.',
    );
  }

  const allEntries = Object.entries(parsed.files);
  // Scope to the target and drop test modules before aggregating.
  const scoped = allEntries.filter(([path]) => matchesTarget(path, target) && !looksLikeTestFile(path));
  const entries = scoped.length > 0 ? scoped : allEntries;
  if (entries.length === 0) {
    throw new CoverageReportError(
      'EMPTY_REPORT',
      'coverage.py JSON report contains zero files. The coverage run measured nothing.',
    );
  }

  const missingSummary = [];
  const totals = { coveredLines: 0, lines: 0, coveredBranches: 0, branches: 0, partialBranches: 0 };
  for (const [path, file] of entries) {
    if (file?.summary == null) {
      missingSummary.push(path);
      continue;
    }
    totals.coveredLines += file.summary.covered_lines ?? 0;
    totals.lines += file.summary.num_statements ?? 0;
    totals.coveredBranches += file.summary.covered_branches ?? 0;
    totals.branches += file.summary.num_branches ?? 0;
    totals.partialBranches += file.summary.num_partial_branches ?? 0;
  }

  if (missingSummary.length > 0) {
    normalized.notes.push(
      `${missingSummary.length} file entry/entries had no "summary" block and were excluded: ${missingSummary.slice(0, 5).join(', ')}.`,
    );
  }
  if (missingSummary.length === entries.length) {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      'No file entry in the coverage.py report contains a "summary" block.',
    );
  }

  // coverage.py counts executable statements by line, so lines and statements
  // are genuinely the same measurement. This is faithful, not a substitution.
  const lineMetric = measuredMetric(
    'lines',
    { covered: totals.coveredLines, total: totals.lines },
    normalized.notes,
  );
  normalized.metrics.lines = lineMetric;
  normalized.metrics.statements = { ...lineMetric };
  normalized.metrics.branches =
    totals.branches > 0
      ? measuredMetric(
          'branches',
          { covered: totals.coveredBranches, total: totals.branches },
          normalized.notes,
        )
      : notApplicableMetric('branches: coverage.py reported no branch points (branch mode may be off)');
  normalized.metrics.functions = unreadableMetric(
    'functions: coverage.py JSON does not report function coverage',
  );

  if (totals.partialBranches > 0) {
    normalized.notes.push(`${totals.partialBranches} partially-taken branch(es) reported by coverage.py.`);
  }
  if (parsed.totals?.percent_covered != null) {
    normalized.notes.push(
      `coverage.py headline percent_covered is ${parsed.totals.percent_covered}%; it includes branches in the denominator when branch mode is on, so it may differ from the line figure above.`,
    );
  }
  normalized.notes.push(
    'coverage.py measures executable statements by line, so "lines" and "statements" are the same measurement here.',
  );
  normalized.files = entries.map(([path]) => path);
  const excluded = allEntries.length - entries.length;
  if (excluded > 0) {
    normalized.notes.push(
      `Aggregated ${entries.length} of ${allEntries.length} reported file(s); ${excluded} test or out-of-target file(s) were excluded so the figure describes production code only.`,
    );
  }
  return normalized;
}

/** RFC 4180 aware split; a quoted field may legally contain a comma. */
function splitCsvRow(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function normalizeJacocoCsv(text, source) {
  const normalized = baseNormalized('jacoco-csv', source);
  const rows = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (rows.length === 0) {
    throw new CoverageReportError('EMPTY_REPORT', 'JaCoCo CSV report is empty.');
  }

  const header = splitCsvRow(rows[0]).map((name) => name.trim().toUpperCase());
  const required = [
    'INSTRUCTION_MISSED',
    'INSTRUCTION_COVERED',
    'BRANCH_MISSED',
    'BRANCH_COVERED',
    'LINE_MISSED',
    'LINE_COVERED',
    'METHOD_MISSED',
    'METHOD_COVERED',
  ];
  const columnIndex = {};
  const missingColumns = [];
  for (const name of required) {
    const index = header.indexOf(name);
    if (index === -1) missingColumns.push(name);
    columnIndex[name] = index;
  }
  if (missingColumns.length > 0) {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      `JaCoCo CSV header is missing required column(s): ${missingColumns.join(', ')}. Columns are mapped by name, not position.`,
      { header },
    );
  }

  const totals = {
    instructionMissed: 0,
    instructionCovered: 0,
    branchMissed: 0,
    branchCovered: 0,
    lineMissed: 0,
    lineCovered: 0,
    methodMissed: 0,
    methodCovered: 0,
  };
  const classIndex = header.indexOf('CLASS');
  const packageIndex = header.indexOf('PACKAGE');
  let dataRows = 0;

  for (const [offset, row] of rows.slice(1).entries()) {
    const fields = splitCsvRow(row);
    if (fields.length !== header.length) {
      throw new CoverageReportError(
        'MALFORMED_REPORT',
        `JaCoCo CSV row ${offset + 2} has ${fields.length} field(s) but the header declares ${header.length}. The report is truncated or malformed.`,
        { row: offset + 2 },
      );
    }
    const readColumn = (name) => intOrThrow(fields[columnIndex[name]], `jacoco ${name} on row ${offset + 2}`);
    totals.instructionMissed += readColumn('INSTRUCTION_MISSED');
    totals.instructionCovered += readColumn('INSTRUCTION_COVERED');
    totals.branchMissed += readColumn('BRANCH_MISSED');
    totals.branchCovered += readColumn('BRANCH_COVERED');
    totals.lineMissed += readColumn('LINE_MISSED');
    totals.lineCovered += readColumn('LINE_COVERED');
    totals.methodMissed += readColumn('METHOD_MISSED');
    totals.methodCovered += readColumn('METHOD_COVERED');
    dataRows += 1;
    if (classIndex !== -1) {
      const packageName = packageIndex === -1 ? '' : `${fields[packageIndex]}.`;
      normalized.files.push(`${packageName}${fields[classIndex]}`);
    }
  }

  if (dataRows === 0) {
    throw new CoverageReportError('EMPTY_REPORT', 'JaCoCo CSV report contains a header but no data rows.');
  }

  normalized.metrics.lines = measuredMetric(
    'lines',
    { covered: totals.lineCovered, total: totals.lineCovered + totals.lineMissed },
    normalized.notes,
  );
  normalized.metrics.branches = measuredMetric(
    'branches',
    { covered: totals.branchCovered, total: totals.branchCovered + totals.branchMissed },
    normalized.notes,
  );
  normalized.metrics.functions = measuredMetric(
    'functions',
    { covered: totals.methodCovered, total: totals.methodCovered + totals.methodMissed },
    normalized.notes,
  );
  normalized.metrics.statements = measuredMetric(
    'statements',
    { covered: totals.instructionCovered, total: totals.instructionCovered + totals.instructionMissed },
    normalized.notes,
  );
  normalized.notes.push('JaCoCo "statements" is instruction coverage, a finer measure than statements.');
  return normalized;
}

function normalizeGoCoverprofile(text, source) {
  const normalized = baseNormalized('go-coverprofile', source);
  const rawLines = text.split(/\r?\n/);
  // Only skip the first line when it is genuinely the mode header.
  const body = /^mode:/i.test(rawLines[0]?.trim() ?? '') ? rawLines.slice(1) : rawLines;

  // Blocks are keyed by position, so a merged profile is unioned rather than summed.
  const blocks = new Map();
  const files = new Set();
  for (const raw of body) {
    const line = raw.trim();
    if (line === '') continue;
    const fields = line.split(/\s+/);
    if (fields.length < 3) continue;
    const position = fields[0];
    const statements = intOrThrow(fields[1], `go coverprofile statement count for ${position}`);
    const count = intOrThrow(fields[2], `go coverprofile hit count for ${position}`);
    const existing = blocks.get(position);
    if (existing == null) {
      blocks.set(position, { statements, count });
    } else {
      existing.count = Math.max(existing.count, count);
    }
    const [filePath] = position.split(':');
    if (filePath) files.add(filePath);
  }

  if (blocks.size === 0) {
    throw new CoverageReportError(
      'EMPTY_REPORT',
      'Go coverprofile contains no coverage blocks. The test run produced no coverage data.',
    );
  }

  let total = 0;
  let covered = 0;
  for (const block of blocks.values()) {
    total += block.statements;
    if (block.count > 0) covered += block.statements;
  }

  normalized.metrics.statements = measuredMetric('statements', { covered, total }, normalized.notes);
  normalized.metrics.lines = unreadableMetric(
    'lines: native Go coverprofiles report statement blocks, not lines. Use "statements" as the gate metric for Go, or convert the profile to lcov.',
  );
  normalized.metrics.branches = notApplicableMetric(
    'branches: native Go coverprofiles do not report branch coverage',
  );
  normalized.metrics.functions = unreadableMetric(
    'functions: native Go coverprofiles do not report function coverage',
  );
  normalized.notes.push(
    `Merged ${blocks.size} distinct Go coverage block(s); repeated blocks were unioned, not summed.`,
  );
  normalized.files = [...files];
  return normalized;
}

function normalizeGcov(text, source) {
  const normalized = baseNormalized('gcov-text', source);
  // gcov prints "Branches executed" (instrumented density) BEFORE
  // "Taken at least once" (actual branch coverage). A non-global match returns
  // the earlier position, so the correct line must be selected explicitly.
  const lineMatches = [...text.matchAll(/Lines executed:([\d.]+)% of (\d+)/gi)];
  if (lineMatches.length === 0) {
    throw new CoverageReportError(
      'EMPTY_REPORT',
      'Could not find a gcov "Lines executed:" summary. The report is empty or not gcov output.',
    );
  }

  const aggregate = (matches) =>
    matches.reduce(
      (accumulator, match) => {
        const pct = Number.parseFloat(match[1]);
        const total = intOrThrow(match[2], 'gcov denominator');
        if (!Number.isFinite(pct)) {
          throw new CoverageReportError('MALFORMED_REPORT', `gcov percentage is not a number: ${match[1]}`);
        }
        return {
          total: accumulator.total + total,
          covered: accumulator.covered + Math.round((pct / 100) * total),
        };
      },
      { total: 0, covered: 0 },
    );

  const lineTotals = aggregate(lineMatches);
  normalized.metrics.lines = measuredMetric('lines', lineTotals, normalized.notes);
  normalized.metrics.statements = unreadableMetric(
    'statements: gcov reports line coverage, not statement coverage',
  );

  const takenMatches = [...text.matchAll(/Taken at least once:([\d.]+)% of (\d+)/gi)];
  const executedMatches = [...text.matchAll(/Branches executed:([\d.]+)% of (\d+)/gi)];

  if (takenMatches.length > 0) {
    normalized.metrics.branches = measuredMetric('branches', aggregate(takenMatches), normalized.notes);
  } else if (executedMatches.length > 0) {
    normalized.metrics.branches = unreadableMetric(
      'branches: this gcov report has "Branches executed" but no "Taken at least once". "Branches executed" measures instrumented-branch density, not branch coverage. Re-run gcov with -b to obtain branch coverage.',
    );
    normalized.notes.push(
      'Branch coverage was NOT derived from "Branches executed"; that figure is instrumentation density and would overstate coverage.',
    );
  } else {
    normalized.metrics.branches = notApplicableMetric('branches: this gcov report contains no branch data');
  }

  normalized.metrics.functions = unreadableMetric(
    'functions: gcov function coverage is not parsed by this normalizer',
  );
  if (lineMatches.length > 1) {
    normalized.notes.push(`Aggregated ${lineMatches.length} gcov file summaries.`);
  }
  normalized.notes.push('gcov reports percentages; covered counts were derived from percentage x denominator.');
  return normalized;
}

function normalizeCoberturaXml(text, source) {
  const normalized = baseNormalized('cobertura-xml', source);
  const coverage = text.match(/<coverage\b[^>]*>/i)?.[0];
  if (coverage == null) {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      'Cobertura XML has no <coverage> element. The report is truncated or not Cobertura.',
    );
  }

  const attribute = (name) => coverage.match(new RegExp(`${name}="([^"]+)"`, 'i'))?.[1];
  const readSlot = (label, coveredName, validName, rateName) => {
    const validRaw = attribute(validName);
    const coveredRaw = attribute(coveredName);
    const rateRaw = attribute(rateName);

    if (validRaw != null) {
      const total = intOrThrow(validRaw, `cobertura ${validName}`);
      if (total === 0) {
        return notApplicableMetric(
          `${label}: the tool reported ${validName}="0", so there is no denominator to measure`,
        );
      }
      return measuredMetric(
        label,
        { covered: coveredRaw == null ? null : intOrThrow(coveredRaw, `cobertura ${coveredName}`), total },
        normalized.notes,
      );
    }

    if (rateRaw == null) {
      return unreadableMetric(`${label}: neither ${validName} nor ${rateName} is present`);
    }
    const rate = Number.parseFloat(rateRaw);
    if (!Number.isFinite(rate)) {
      throw new CoverageReportError('MALFORMED_REPORT', `cobertura ${rateName} is not a number: ${rateRaw}`);
    }
    if (rate < 0 || rate > 1) {
      throw new CoverageReportError(
        'INCONSISTENT_METRIC',
        `cobertura ${rateName}="${rateRaw}" is outside 0-1. Cobertura rates are fractions; this looks like a percentage.`,
        { label, rate },
      );
    }
    return measuredMetric(label, { pct: rate * 100 }, normalized.notes);
  };

  normalized.metrics.lines = readSlot('lines', 'lines-covered', 'lines-valid', 'line-rate');
  normalized.metrics.branches = readSlot('branches', 'branches-covered', 'branches-valid', 'branch-rate');
  normalized.metrics.functions = unreadableMetric('functions: Cobertura root counters do not include functions');
  normalized.metrics.statements = unreadableMetric(
    'statements: Cobertura reports lines, not statements separately',
  );

  normalized.files = [...text.matchAll(/<class\b[^>]*filename="([^"]+)"/gi)].map((match) => match[1]);
  return normalized;
}

function inferFormat(filePath, raw) {
  const fileName = filePath ? basename(filePath).toLowerCase() : '';
  const extension = filePath ? extname(filePath).toLowerCase() : '';
  const trimmed = raw.trim();

  const looksLikeLcov =
    fileName === 'lcov.info' ||
    extension === '.lcov' ||
    trimmed.startsWith('TN:') ||
    /^SF:/m.test(trimmed) ||
    trimmed.includes('\nLF:');
  if (looksLikeLcov) return 'lcov';

  if (/^mode:\s*(set|count|atomic)/i.test(trimmed)) return 'go-coverprofile';
  if (fileName.endsWith('.coverage')) return 'coverage-py-database';
  if (fileName.endsWith('.gcov') || /^Lines executed:/m.test(trimmed)) return 'gcov-text';
  if (extension === '.csv' && /^GROUP,PACKAGE,CLASS,/i.test(trimmed)) return 'jacoco-csv';
  if (extension === '.xml' && /<coverage\b/i.test(trimmed)) return 'cobertura-xml';

  if (extension === '.json' || trimmed.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new CoverageReportError(
        'MALFORMED_REPORT',
        `Coverage report is not valid JSON (truncated or partially written?): ${error.message}`,
        { parseError: error.message },
      );
    }
    if (parsed.files) return 'coverage-py-json';
    if (parsed.total || parsed.lines || parsed.branches || parsed.functions || parsed.statements) {
      return 'istanbul-summary-json';
    }
    throw new CoverageReportError(
      'UNSUPPORTED_FORMAT',
      'Unsupported JSON coverage report. Export an Istanbul summary JSON or a coverage.py JSON report.',
    );
  }

  // A text summary is only inferred from a recognisable table, never as a
  // catch-all. Arbitrary prose containing "All files |" is not a coverage report.
  const isPytestTable = /^Name\s+Stmts\s+Miss(?:\s+Branch\s+BrPart)?\s+Cover/im.test(trimmed);
  const isIstanbulTable =
    /^All files\s*\|/im.test(trimmed) && (/%\s*Stmts/i.test(trimmed) || /^-+\|/m.test(trimmed));
  if (isPytestTable || isIstanbulTable) return 'text-summary';

  throw new CoverageReportError(
    'UNSUPPORTED_FORMAT',
    'Could not identify the coverage report format. Pass --format explicitly (lcov, istanbul-summary-json, coverage-py-json, jacoco-csv, go-coverprofile, gcov-text, cobertura-xml, text-summary).',
    { fileName, extension },
  );
}

function resolveCoverageContent(filePath, content) {
  const resolvedPath = filePath ? resolve(filePath) : null;
  const source = resolvedPath ?? 'inline-content';

  if (content != null) {
    if (content.trim() === '') {
      throw new CoverageReportError('EMPTY_REPORT', 'Coverage content was supplied but is empty.');
    }
    return { resolvedPath, source, raw: content };
  }

  if (resolvedPath == null) {
    throw new CoverageReportError(
      'MISSING_INPUT',
      'Coverage content is required: pass --filePath or --content.',
    );
  }
  if (!existsSync(resolvedPath)) {
    throw new CoverageReportError(
      'REPORT_NOT_FOUND',
      `No coverage report exists at "${resolvedPath}". The coverage run may not have produced one.`,
      { path: resolvedPath },
    );
  }

  const raw = readFileSync(resolvedPath, 'utf8');
  if (raw.trim() === '') {
    throw new CoverageReportError(
      'EMPTY_REPORT',
      `The coverage report at "${resolvedPath}" is empty (0 bytes of content). The coverage run produced no data.`,
      { path: resolvedPath },
    );
  }
  return { resolvedPath, source, raw };
}

function normalizeByFormat(resolvedFormat, raw, source, target) {
  switch (resolvedFormat) {
    case 'istanbul-summary-json':
      return normalizeIstanbulSummary(parseJson(raw), source);
    case 'coverage-py-json':
      return normalizeCoveragePyJson(parseJson(raw), source, target);
    case 'lcov':
      return normalizeLcov(raw, source);
    case 'text-summary':
      return normalizeTextSummary(raw, source);
    case 'jacoco-csv':
      return normalizeJacocoCsv(raw, source);
    case 'go-coverprofile':
      return normalizeGoCoverprofile(raw, source);
    case 'gcov-text':
      return normalizeGcov(raw, source);
    case 'cobertura-xml':
      return normalizeCoberturaXml(raw, source);
    case 'coverage-py-database':
      throw new CoverageReportError(
        'UNSUPPORTED_FORMAT',
        'coverage.py ".coverage" databases are not portable reports. Run "coverage json" first.',
      );
    default:
      throw new CoverageReportError(
        'UNSUPPORTED_FORMAT',
        `Unsupported coverage report format: ${resolvedFormat}`,
      );
  }
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CoverageReportError(
      'MALFORMED_REPORT',
      `Coverage report is not valid JSON (truncated or partially written?): ${error.message}`,
      { parseError: error.message },
    );
  }
}

const SUMMARY_ONLY_FORMATS = new Set(['text-summary', 'gcov-text']);

/**
 * Normalize a coverage report to one shape.
 *
 * @param {{ filePath?: string, content?: string, format?: string, target?: string }} [input]
 *   `target` is the module the report is expected to describe. Supplying it turns
 *   a wrong-project report into an error instead of silent misattribution.
 */
export function normalizeCoverageReport({ filePath, content, format, target } = {}) {
  const { resolvedPath, source, raw } = resolveCoverageContent(filePath, content);
  const resolvedFormat = format ?? inferFormat(resolvedPath, raw);
  const normalized = normalizeByFormat(resolvedFormat, raw, source, target);

  const usable = Object.values(normalized.metrics).some(
    (metric) => metric.status === METRIC_STATUS.MEASURED,
  );
  if (!usable) {
    throw new CoverageReportError(
      'NOTHING_MEASURABLE',
      `The coverage report at "${source}" yielded no measurable metric. This is missing evidence, not zero coverage.`,
      { format: resolvedFormat },
    );
  }

  if (target != null && target !== '') {
    normalized.target = target;
    // Attribution can only be checked against per-file data. A summary-only
    // format, or a report that carries no file entries at all, is unverifiable —
    // that is a warning. A report that DOES list files but omits the target is
    // evidence for a different module, and that is an error.
    if (SUMMARY_ONLY_FORMATS.has(resolvedFormat) || normalized.files.length === 0) {
      normalized.notes.push(
        `Target attribution is unverifiable for this ${resolvedFormat} report: it carries no per-file paths. Confirm the command was scoped to "${target}".`,
      );
    } else {
      const normalizedTarget = target.replace(/\\/g, '/');
      const matched = normalized.files.some((file) => {
        const candidate = String(file).replace(/\\/g, '/');
        return candidate.includes(normalizedTarget) || normalizedTarget.includes(candidate);
      });
      if (!matched) {
        throw new CoverageReportError(
          'TARGET_NOT_IN_REPORT',
          `The coverage report at "${source}" contains no entry for target "${target}". It describes a different project or scope, so it is not evidence for this target.`,
          { target, fileCount: normalized.files.length, sample: normalized.files.slice(0, 5) },
        );
      }
    }
  }

  return normalized;
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
    const normalized = normalizeCoverageReport({
      filePath: typeof args.filePath === 'string' ? args.filePath : undefined,
      content: typeof args.content === 'string' ? args.content : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
      target: typeof args.target === 'string' ? args.target : undefined,
    });
    process.stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof CoverageReportError ? error.code : 'UNEXPECTED_ERROR';
    process.stderr.write(
      `${JSON.stringify({ error: code, message: error.message, details: error.details ?? {} }, null, 2)}\n`,
    );
    process.exitCode = exitCodeFor(error);
  }
}

// Compare resolved URLs so the CLI still runs through a symlink or a renamed copy.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
