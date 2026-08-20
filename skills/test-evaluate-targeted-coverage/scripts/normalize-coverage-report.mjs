import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

function roundPct(value) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function metric(covered, total, pct, supported = true) {
  let resolvedPct = null;
  if (pct == null) {
    if (total) {
      resolvedPct = roundPct((covered / total) * 100);
    }
  } else {
    resolvedPct = roundPct(pct);
  }

  return {
    covered: covered ?? null,
    total: total ?? null,
    pct: resolvedPct,
    supported,
  };
}

function emptyMetric() {
  return metric(null, null, null, false);
}

function baseNormalized(format, source) {
  return {
    format,
    source,
    metrics: {
      lines: emptyMetric(),
      branches: emptyMetric(),
      functions: emptyMetric(),
      statements: emptyMetric(),
    },
    notes: [],
  };
}

function normalizeIstanbulSummary(parsed, source) {
  const normalized = baseNormalized('istanbul-summary-json', source);
  const total = parsed.total ?? parsed;

  if (total.lines) {
    normalized.metrics.lines = metric(total.lines.covered, total.lines.total, total.lines.pct);
  }
  if (total.branches) {
    normalized.metrics.branches = metric(
      total.branches.covered,
      total.branches.total,
      total.branches.pct,
    );
  }
  if (total.functions) {
    normalized.metrics.functions = metric(
      total.functions.covered,
      total.functions.total,
      total.functions.pct,
    );
  }
  if (total.statements) {
    normalized.metrics.statements = metric(
      total.statements.covered,
      total.statements.total,
      total.statements.pct,
    );
  }

  return normalized;
}

function normalizeLcov(text, source) {
  const normalized = baseNormalized('lcov', source);
  let lineFound = 0;
  let lineHit = 0;
  let branchFound = 0;
  let branchHit = 0;
  let functionFound = 0;
  let functionHit = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('LF:')) {
      lineFound += Number.parseInt(line.slice(3), 10);
    } else if (line.startsWith('LH:')) {
      lineHit += Number.parseInt(line.slice(3), 10);
    } else if (line.startsWith('BRF:')) {
      branchFound += Number.parseInt(line.slice(4), 10);
    } else if (line.startsWith('BRH:')) {
      branchHit += Number.parseInt(line.slice(4), 10);
    } else if (line.startsWith('FNF:')) {
      functionFound += Number.parseInt(line.slice(4), 10);
    } else if (line.startsWith('FNH:')) {
      functionHit += Number.parseInt(line.slice(4), 10);
    }
  }

  normalized.metrics.lines = metric(lineHit, lineFound, null, lineFound > 0);
  normalized.metrics.branches = metric(branchHit, branchFound, null, branchFound > 0);
  normalized.metrics.functions = metric(functionHit, functionFound, null, functionFound > 0);
  normalized.metrics.statements = metric(null, null, null, false);
  normalized.notes.push(
    'Statements are not reported separately in LCOV; line coverage is the closest available metric.',
  );

  return normalized;
}

function normalizeTextSummary(text, source) {
  const normalized = baseNormalized('text-summary', source);
  const totalLine = text
    .split(/\r?\n/)
    .find((line) => /^TOTAL\s+/i.test(line.trim()) || /^All files\s*\|/i.test(line.trim()));

  if (!totalLine) {
    throw new Error('Could not find a TOTAL or All files summary line in text coverage report.');
  }

  const percentages = [...totalLine.matchAll(/(\d+(?:\.\d+)?)%/g)].map((match) =>
    Number.parseFloat(match[1]),
  );
  if (percentages.length === 0) {
    throw new Error('Could not find percentage values in text coverage summary line.');
  }

  normalized.metrics.lines = metric(null, null, percentages[0], true);
  normalized.metrics.statements = metric(null, null, percentages[0], true);

  if (percentages.length > 1) {
    normalized.metrics.branches = metric(null, null, percentages[1], true);
  }
  if (percentages.length > 2) {
    normalized.metrics.functions = metric(null, null, percentages[2], true);
  }

  normalized.notes.push(
    'Covered/total counts were not available from the text summary and were left null.',
  );
  return normalized;
}

function inferFormat(filePath, raw) {
  const fileName = filePath ? basename(filePath).toLowerCase() : '';
  const extension = filePath ? extname(filePath).toLowerCase() : '';
  const trimmed = raw.trim();
  const looksLikeLcov =
    fileName === 'lcov.info' || trimmed.startsWith('TN:') || trimmed.includes('\nLF:');

  if (looksLikeLcov) {
    return 'lcov';
  }
  if (extension === '.json') {
    return 'istanbul-summary-json';
  }
  return 'text-summary';
}

function resolveCoverageContent(filePath, content) {
  const resolvedPath = filePath ? resolve(filePath) : null;
  const source = resolvedPath ?? 'inline-content';
  const raw =
    content ??
    (resolvedPath && existsSync(resolvedPath) ? readFileSync(resolvedPath, 'utf8') : null);

  if (!raw) {
    throw new Error('Coverage content is required via filePath or content.');
  }

  return { resolvedPath, source, raw };
}

function normalizeByFormat(resolvedFormat, raw, source) {
  if (resolvedFormat === 'istanbul-summary-json') {
    return normalizeIstanbulSummary(JSON.parse(raw), source);
  }
  if (resolvedFormat === 'lcov') {
    return normalizeLcov(raw, source);
  }
  if (resolvedFormat === 'text-summary') {
    return normalizeTextSummary(raw, source);
  }

  throw new Error(`Unsupported coverage report format: ${resolvedFormat}`);
}

export function normalizeCoverageReport({ filePath, content, format } = {}) {
  const { resolvedPath, source, raw } = resolveCoverageContent(filePath, content);

  const resolvedFormat = format ?? inferFormat(resolvedPath, raw);
  return normalizeByFormat(resolvedFormat, raw, source);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const normalized = normalizeCoverageReport({
    filePath: args.filePath,
    content: args.content,
    format: args.format,
  });
  process.stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
}

if (basename(process.argv[1] ?? '') === 'normalize-coverage-report.mjs') {
  main();
}
