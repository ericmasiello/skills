import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CoverageReportError,
  METRIC_STATUS,
  normalizeCoverageReport,
} from './normalize-coverage-report.mjs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * Assert that a call throws a CoverageReportError carrying an expected code.
 *
 * `messagePattern` pins which specific guard fired. Several invariants overlap
 * (a covered>total report also yields an out-of-range percentage), so without
 * matching the message, removing one guard is masked by the next.
 */
function throwsCode(code, run, message, messagePattern) {
  try {
    run();
  } catch (error) {
    assert.ok(
      error instanceof CoverageReportError,
      `${message}: expected CoverageReportError, got ${error.name}: ${error.message}`,
    );
    assert.equal(error.code, code, `${message}: expected code ${code}, got ${error.code}`);
    if (messagePattern) {
      assert.match(error.message, messagePattern, `${message}: wrong guard fired`);
    }
    return;
  }
  assert.fail(`${message}: expected a ${code} error but the call succeeded`);
}

// ---------------------------------------------------------------------------
// Happy path, one case per supported format
// ---------------------------------------------------------------------------

const cases = [
  ['coverage.json', 'coverage-py-json', 97.3, 100],
  ['jacoco.csv', 'jacoco-csv', 91.18, 83.33],
  ['coverage.out', 'go-coverprofile', null, null],
  ['kata.c.gcov', 'gcov-text', 93.75, 83.33],
  ['coverage.cobertura.xml', 'cobertura-xml', 95.65, 66.67],
  ['pytest-cov.txt', 'text-summary', 97.3, null],
  ['pytest-cov-no-branches.txt', 'text-summary', 97.3, null],
];

for (const [name, format, linePct, branchPct] of cases) {
  const report = normalizeCoverageReport({ filePath: join(fixtures, name) });
  assert.equal(report.format, format, `${name}: format`);
  assert.equal(report.metrics.lines.pct, linePct, `${name}: line pct`);
  assert.equal(report.metrics.branches.pct, branchPct, `${name}: branch pct`);
}

const pytestCov = normalizeCoverageReport({ filePath: join(fixtures, 'pytest-cov.txt') });
assert.equal(pytestCov.metrics.lines.covered, 36);
assert.equal(pytestCov.metrics.lines.total, 37);
assert.equal(pytestCov.metrics.lines.pct, 97.3);
assert.equal(pytestCov.metrics.lines.supported, true);
assert.equal(pytestCov.metrics.lines.status, METRIC_STATUS.MEASURED);
assert.equal(pytestCov.metrics.branches.supported, false);
assert.match(pytestCov.notes.join('\n'), /combined coverage is 97%/);

const textSummary = normalizeCoverageReport({
  content: 'All files | 80 | 70 | 60 | 50 |',
  format: 'text-summary',
});
assert.equal(textSummary.metrics.statements.pct, 80);
assert.equal(textSummary.metrics.branches.pct, 70);
assert.equal(textSummary.metrics.functions.pct, 60);
assert.equal(textSummary.metrics.lines.pct, 50);

const rateOnlyCobertura = normalizeCoverageReport({
  content: '<coverage line-rate="0.8" branch-rate="0.5"/>',
  format: 'cobertura-xml',
});
assert.equal(rateOnlyCobertura.metrics.lines.pct, 80);
assert.equal(rateOnlyCobertura.metrics.branches.pct, 50);

// ---------------------------------------------------------------------------
// gcov must read "Taken at least once", never "Branches executed"
// "Branches executed" is instrumented-branch density and overstates coverage.
// gcov prints it FIRST, so a non-global match silently picks the wrong figure.
// ---------------------------------------------------------------------------

const gcov = normalizeCoverageReport({
  content: [
    "File 'kata.c'",
    'Lines executed:93.75% of 64',
    'Branches executed:100.00% of 24',
    'Taken at least once:50.00% of 24',
  ].join('\n'),
  format: 'gcov-text',
});
assert.equal(gcov.metrics.branches.pct, 50, 'gcov branch must come from "Taken at least once"');

const gcovNoTaken = normalizeCoverageReport({
  content: ['Lines executed:90.00% of 10', 'Branches executed:100.00% of 4'].join('\n'),
  format: 'gcov-text',
});
assert.equal(gcovNoTaken.metrics.branches.status, METRIC_STATUS.UNREADABLE);
assert.equal(gcovNoTaken.metrics.branches.pct, null, 'density must never be reported as coverage');

const gcovMultiFile = normalizeCoverageReport({
  content: ['Lines executed:100.00% of 10', 'Lines executed:0.00% of 990'].join('\n'),
  format: 'gcov-text',
});
assert.equal(gcovMultiFile.metrics.lines.total, 1000, 'all gcov file summaries must aggregate');
assert.equal(gcovMultiFile.metrics.lines.pct, 1);

// ---------------------------------------------------------------------------
// metric() invariants: an impossible number is corrupt input, never a value
// ---------------------------------------------------------------------------

throwsCode(
  'INCONSISTENT_METRIC',
  () =>
    normalizeCoverageReport({
      content: JSON.stringify({ total: { lines: { covered: 150, total: 100, pct: 150 } } }),
      format: 'istanbul-summary-json',
    }),
  'covered greater than total',
);

throwsCode(
  'INCONSISTENT_METRIC',
  () =>
    normalizeCoverageReport({
      content: JSON.stringify({ total: { lines: { covered: -5, total: 10, pct: -50 } } }),
      format: 'istanbul-summary-json',
    }),
  'negative numerator',
);

// Isolates the covered<=total invariant specifically: the reported percentage is
// in range, so only the count comparison can catch this.
throwsCode(
  'INCONSISTENT_METRIC',
  () =>
    normalizeCoverageReport({
      content: JSON.stringify({ total: { lines: { covered: 15, total: 10, pct: 100 } } }),
      format: 'istanbul-summary-json',
    }),
  'covered greater than total behind an in-range percentage',
  /covered 15 exceeds total 10/,
);

throwsCode(
  'INCONSISTENT_METRIC',
  () =>
    normalizeCoverageReport({
      content: JSON.stringify({ total: { lines: { covered: 10, total: -100 } } }),
      format: 'istanbul-summary-json',
    }),
  'negative denominator',
  /denominator is negative/,
);

// A zero denominator inside measuredMetric is Not-Applicable, not an error and
// not 0%.
const lcovZeroDenominator = normalizeCoverageReport({
  content: 'TN:\nSF:/a.js\nLF:0\nLH:0\nBRF:4\nBRH:2\nend_of_record\n',
  format: 'lcov',
});
assert.equal(lcovZeroDenominator.metrics.lines.status, METRIC_STATUS.NOT_APPLICABLE);
assert.equal(lcovZeroDenominator.metrics.lines.pct, null);
assert.equal(lcovZeroDenominator.metrics.branches.pct, 50);

// Isolates the 0-100 range check specifically: there are no counts to compare,
// so only the range check can catch this.
throwsCode(
  'INCONSISTENT_METRIC',
  () =>
    normalizeCoverageReport({
      content: JSON.stringify({ total: { lines: { pct: 150 } } }),
      format: 'istanbul-summary-json',
    }),
  'percentage above 100 with no counts',
  /percentage 150 is outside 0-100/,
);

throwsCode(
  'INCONSISTENT_METRIC',
  () =>
    normalizeCoverageReport({
      content: JSON.stringify({ total: { lines: { pct: -20 } } }),
      format: 'istanbul-summary-json',
    }),
  'negative percentage with no counts',
);

throwsCode(
  'INCONSISTENT_METRIC',
  () => normalizeCoverageReport({ content: '<coverage line-rate="85"/>', format: 'cobertura-xml' }),
  'cobertura rate supplied as a percentage',
  /rates are fractions/,
);

throwsCode(
  'INCONSISTENT_METRIC',
  () =>
    normalizeCoverageReport({
      content: 'TN:\nSF:/a.js\nBRF:8\nBRH:17\nend_of_record\n',
      format: 'lcov',
    }),
  'lcov branch hits exceed branches found',
);

// A zero denominator is Not-Applicable, never a 0% failure.
const zeroBranch = normalizeCoverageReport({
  content: '<coverage lines-covered="10" lines-valid="10" branches-covered="0" branches-valid="0" branch-rate="0" line-rate="1"/>',
  format: 'cobertura-xml',
});
assert.equal(zeroBranch.metrics.branches.status, METRIC_STATUS.NOT_APPLICABLE);
assert.equal(zeroBranch.metrics.branches.pct, null, 'zero denominator must not become 0%');

// ---------------------------------------------------------------------------
// LCOV: merge repeated records, detect truncation, support DA/BRDA only
// ---------------------------------------------------------------------------

const mergedLcov = normalizeCoverageReport({
  content: 'TN:\nSF:/a.js\nLF:10\nLH:8\nend_of_record\nSF:/a.js\nLF:10\nLH:3\nend_of_record\n',
  format: 'lcov',
});
assert.equal(mergedLcov.metrics.lines.total, 10, 'repeated lcov records must merge, not sum');
assert.equal(mergedLcov.metrics.lines.pct, 80);

throwsCode(
  'MALFORMED_REPORT',
  () =>
    normalizeCoverageReport({
      content: 'TN:\nSF:/a.js\nLF:10\nLH:10\nend_of_record\nSF:/b.js\nLF:5\nLH:1\n',
      format: 'lcov',
    }),
  'lcov record with no end_of_record terminator',
);

throwsCode(
  'MALFORMED_REPORT',
  () => normalizeCoverageReport({ content: 'TN:\nSF:/a.js\nLF:abc\nLH:5\nend_of_record\n', format: 'lcov' }),
  'non-numeric lcov counter',
);

const daOnly = normalizeCoverageReport({
  content: 'TN:\nSF:/a.js\nDA:1,5\nDA:2,5\nDA:3,0\nBRDA:2,0,0,5\nBRDA:2,0,1,0\nend_of_record\n',
  format: 'lcov',
});
assert.equal(daOnly.metrics.lines.pct, 66.67, 'DA records alone must yield line coverage');
assert.equal(daOnly.metrics.branches.pct, 50, 'BRDA records alone must yield branch coverage');

// ---------------------------------------------------------------------------
// JaCoCo CSV: quote-aware, header-mapped, row-length checked
// ---------------------------------------------------------------------------

const jacocoHeader =
  'GROUP,PACKAGE,CLASS,INSTRUCTION_MISSED,INSTRUCTION_COVERED,BRANCH_MISSED,BRANCH_COVERED,LINE_MISSED,LINE_COVERED,COMPLEXITY_MISSED,COMPLEXITY_COVERED,METHOD_MISSED,METHOD_COVERED';
const quotedJacoco = normalizeCoverageReport({
  content: `${jacocoHeader}\n"kata, extra",org.kata,Die,2,20,1,5,3,31,1,6,2,10\n`,
  format: 'jacoco-csv',
});
assert.equal(quotedJacoco.metrics.lines.pct, 91.18, 'a quoted comma must not shift columns');
assert.equal(quotedJacoco.metrics.branches.pct, 83.33);

throwsCode(
  'MALFORMED_REPORT',
  () => normalizeCoverageReport({ content: `${jacocoHeader}\nkata,org.kata,Die,2,20\n`, format: 'jacoco-csv' }),
  'jacoco row shorter than its header',
  /has 5 field\(s\) but the header declares 13/,
);

throwsCode(
  'MALFORMED_REPORT',
  () => normalizeCoverageReport({ content: 'A,B,C\n1,2,3\n', format: 'jacoco-csv' }),
  'jacoco header missing required columns',
);

// ---------------------------------------------------------------------------
// Go coverprofile: optional mode line, unioned duplicate blocks
// ---------------------------------------------------------------------------

const goNoMode = normalizeCoverageReport({
  content: 'a.go:1.1,2.2 2 1\na.go:3.1,4.2 3 0\n',
  format: 'go-coverprofile',
});
assert.equal(goNoMode.metrics.statements.pct, 40, 'a missing mode line must not drop the first block');

const goDuplicate = normalizeCoverageReport({
  content: 'mode: set\na.go:1.1,2.2 5 0\na.go:1.1,2.2 5 1\n',
  format: 'go-coverprofile',
});
assert.equal(goDuplicate.metrics.statements.total, 5, 'repeated go blocks must union, not sum');
assert.equal(goDuplicate.metrics.statements.pct, 100);
assert.equal(goDuplicate.metrics.lines.status, METRIC_STATUS.UNREADABLE, 'go reports statements, not lines');

// ---------------------------------------------------------------------------
// Absent, empty and unidentifiable input must fail loudly and distinctly
// ---------------------------------------------------------------------------

throwsCode('REPORT_NOT_FOUND', () => normalizeCoverageReport({ filePath: '/nope/lcov.info' }), 'missing file');
throwsCode('EMPTY_REPORT', () => normalizeCoverageReport({ content: '   ', format: 'lcov' }), 'empty content');
throwsCode('EMPTY_REPORT', () => normalizeCoverageReport({ content: 'TN:\n', format: 'lcov' }), 'lcov with no records');
throwsCode(
  'EMPTY_REPORT',
  () => normalizeCoverageReport({ content: '{"files":{}}', format: 'coverage-py-json' }),
  'coverage.py with zero files',
);
throwsCode(
  'MALFORMED_REPORT',
  () => normalizeCoverageReport({ content: '{"files":{"a.py":{}}}', format: 'coverage-py-json' }),
  'coverage.py entries with no summary block',
);
throwsCode(
  'MALFORMED_REPORT',
  () => normalizeCoverageReport({ content: '{"total":{"lines":{"covered":1,', format: 'istanbul-summary-json' }),
  'truncated JSON',
);
throwsCode(
  'MALFORMED_REPORT',
  () => normalizeCoverageReport({ content: '<html>no coverage element</html>', format: 'cobertura-xml' }),
  'cobertura with no coverage element',
);
throwsCode('MISSING_INPUT', () => normalizeCoverageReport({}), 'neither filePath nor content');

// A report that parses but yields no measurable metric is missing evidence, not
// zero coverage.
throwsCode(
  'NOTHING_MEASURABLE',
  () => normalizeCoverageReport({ content: JSON.stringify({ total: {} }), format: 'istanbul-summary-json' }),
  'an Istanbul summary with no metric slots',
  /no measurable metric/,
);

// A zero-byte file on disk is distinct from a missing file and from bad content.
const emptyOnDisk = join(mkdtempSync(join(tmpdir(), 'coverage-empty-')), 'lcov.info');
writeFileSync(emptyOnDisk, '');
throwsCode(
  'EMPTY_REPORT',
  () => normalizeCoverageReport({ filePath: emptyOnDisk }),
  'a zero-byte report file',
  /0 bytes of content/,
);

// Arbitrary prose must not be accepted as a coverage report. "text-summary" was
// previously the catch-all fallback for any unrecognised input.
throwsCode(
  'UNSUPPORTED_FORMAT',
  () => normalizeCoverageReport({ content: 'Release notes\nAll files | 2024 | 12 | 31 | 99 | prose\n' }),
  'prose containing an "All files" line',
);

// ---------------------------------------------------------------------------
// Target attribution: a report for another project is not evidence for this one
// ---------------------------------------------------------------------------

const attributed = normalizeCoverageReport({
  content: 'TN:\nSF:src/a.js\nLF:10\nLH:8\nend_of_record\n',
  format: 'lcov',
  target: 'src/a.js',
});
assert.equal(attributed.target, 'src/a.js');

throwsCode(
  'TARGET_NOT_IN_REPORT',
  () =>
    normalizeCoverageReport({
      content: 'TN:\nSF:src/a.js\nLF:10\nLH:8\nend_of_record\n',
      format: 'lcov',
      target: 'src/unrelated.js',
    }),
  'report that does not mention the requested target',
);

// A summary-only format cannot verify attribution, and must say so rather than
// implying the number belongs to the target.
const unverifiable = normalizeCoverageReport({
  filePath: join(fixtures, 'pytest-cov.txt'),
  target: 'src/whatever.py',
});
assert.match(unverifiable.notes.join('\n'), /attribution is unverifiable/i);

process.stdout.write('normalize-coverage-report regressions passed\n');
