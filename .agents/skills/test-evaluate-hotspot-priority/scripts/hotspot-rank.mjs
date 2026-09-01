import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeChangeFrequency } from './change-frequency.mjs';
import { computeComplexityProxy } from './complexity-proxy.mjs';

export const EXIT_CODES = {
  OK: 0,
  CRASH: 1,
  BAD_ARGS: 2,
  NOTHING_RANKED: 5,
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

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

/**
 * Split a CSV argument WITHOUT dropping empty entries.
 *
 * Positional alignment against `--paths` is load-bearing: filtering empties
 * would silently shift every later coverage value onto the wrong module. An
 * empty entry is preserved here and rejected later, by index, as missing
 * evidence for that specific path.
 */
function splitCsv(value) {
  if (value == null || value === true || value === '') {
    return [];
  }
  return String(value)
    .split(',')
    .map((entry) => entry.trim());
}

function requireMeasuredPercent(rawValue, label) {
  if (rawValue == null || rawValue === true || String(rawValue).trim() === '') {
    throw new Error(
      `${label} is required and must be a measured number (0-100). An empty value is missing evidence, not 0%.`,
    );
  }
  const value = Number(String(rawValue).trim());
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number (0-100), got ${JSON.stringify(rawValue)}`);
  }
  if (value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100, got ${value}`);
  }
  return value;
}

/**
 * Compute a single module's hotspot score from already-known factors.
 *
 * hotspot = change_frequency × complexity × uncovered_fraction
 *
 * `uncovered_fraction` is `1 − line_coverage_fraction` when only line coverage is
 * supplied. When `branchCoveragePercent` is ALSO supplied, `uncovered_fraction` is
 * `max(1 − line_coverage_fraction, 1 − branch_coverage_fraction)` — a module that is
 * 100% line-covered but has real uncovered branches (e.g. an untested early-return or
 * error path) must not silently score 0. Taking the max (not an average) means a
 * branch-only gap can never be diluted below its own severity by a high line number.
 *
 * All coverage inputs must be measured, never guessed — a module with unknown
 * coverage is "missing evidence", not a silent 0%. An empty string is rejected
 * rather than coerced to 0, and a module with no commit history is rejected
 * rather than scored 0, because both would invert the ranking.
 *
 * @param {{
 *   changeFrequency: number,
 *   complexity: number,
 *   lineCoveragePercent: number,
 *   branchCoveragePercent?: number,
 *   allowLineOnly?: boolean,
 * }} input
 */
export function computeHotspotScore({
  changeFrequency,
  complexity,
  lineCoveragePercent,
  branchCoveragePercent,
  allowLineOnly = false,
}) {
  if (changeFrequency == null || String(changeFrequency).trim() === '') {
    throw new Error(
      'changeFrequency is required. A path with no commit history is missing evidence, not zero churn.',
    );
  }
  const changeFrequencyValue = Number(changeFrequency);
  if (!Number.isFinite(changeFrequencyValue)) {
    throw new Error('changeFrequency is required and must be a finite number');
  }
  if (changeFrequencyValue < 0) {
    throw new Error(`changeFrequency must be zero or greater, got ${changeFrequencyValue}`);
  }

  if (complexity == null || String(complexity).trim() === '') {
    throw new Error('complexity is required and must be a finite number');
  }
  const complexityValue = Number(complexity);
  if (!Number.isFinite(complexityValue)) {
    throw new Error('complexity is required and must be a finite number');
  }
  if (complexityValue <= 0) {
    throw new Error(`complexity must be greater than zero, got ${complexityValue}`);
  }

  const coveragePercent = requireMeasuredPercent(lineCoveragePercent, 'lineCoveragePercent');

  const hasBranchInput = branchCoveragePercent != null && String(branchCoveragePercent).trim() !== '';
  let branchCoverageValue = null;
  let uncoveredBranchFraction = null;
  if (hasBranchInput) {
    branchCoverageValue = requireMeasuredPercent(branchCoveragePercent, 'branchCoveragePercent');
    uncoveredBranchFraction = 1 - branchCoverageValue / 100;
  }

  // A fully line-covered module with no branch evidence scores 0, which is
  // indistinguishable from "no work needed". Refuse rather than imply safety.
  if (!hasBranchInput && coveragePercent === 100 && !allowLineOnly) {
    throw new Error(
      'lineCoveragePercent is 100 and no branchCoveragePercent was supplied, so this module would score 0 and rank last despite possibly having uncovered branches. Supply branchCoveragePercent, or pass allowLineOnly when the target genuinely has no branch points.',
    );
  }

  const coverageFraction = coveragePercent / 100;
  const uncoveredLineFraction = 1 - coverageFraction;
  const uncoveredFraction = hasBranchInput
    ? Math.max(uncoveredLineFraction, uncoveredBranchFraction)
    : uncoveredLineFraction;
  const bindingFactor = hasBranchInput
    ? uncoveredBranchFraction >= uncoveredLineFraction
      ? 'branch'
      : 'line'
    : 'line';
  const score = changeFrequencyValue * complexityValue * uncoveredFraction;

  return {
    changeFrequency: changeFrequencyValue,
    complexity: complexityValue,
    lineCoveragePercent: coveragePercent,
    uncoveredLineFraction,
    ...(hasBranchInput
      ? { branchCoveragePercent: branchCoverageValue, uncoveredBranchFraction }
      : {}),
    uncoveredFraction,
    bindingFactor,
    score,
  };
}

/**
 * Rank already-scored modules highest-hotspot first.
 *
 * Ties are broken deterministically: higher change frequency first, then path
 * ascending. Without a tie-break the output depends on argv order, so two runs
 * over the same modules can disagree on which work is dispatched.
 *
 * @param {Array<{ path: string } & Record<string, unknown>>} scoredModules
 */
export function rankModules(scoredModules) {
  return [...scoredModules]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const frequencyDelta = (b.changeFrequency ?? 0) - (a.changeFrequency ?? 0);
      if (frequencyDelta !== 0) return frequencyDelta;
      return String(a.path).localeCompare(String(b.path));
    })
    .map((module, index) => ({ ...module, rank: index + 1 }));
}

/**
 * Resolve change frequency + complexity + rank for a set of modules given
 * their measured line coverage. Coverage is never invented: a module without
 * a matching, valid `--lineCoverages` entry is reported under `unresolved`
 * instead of silently scored.
 *
 * @param {{
 *   repoPath?: string,
 *   paths: string[],
 *   lineCoverages: string[],
 *   complexities?: string[],
 *   branchCoverages?: string[],
 *   since?: string,
 *   followRenames?: boolean,
 *   allowLineOnly?: boolean,
 * }} input
 */
export function rankHotspots(input) {
  const repoPath = resolve(input.repoPath ?? '.');
  const paths = input.paths ?? [];
  const lineCoverages = input.lineCoverages ?? [];
  const complexities = input.complexities ?? [];
  const branchCoverages = input.branchCoverages ?? [];
  const since = input.since;
  const followRenames = input.followRenames === true;
  const allowLineOnly = input.allowLineOnly === true;

  if (paths.length === 0) {
    throw new Error('At least one module path is required (--paths)');
  }
  if (paths.some((path) => path === '')) {
    throw new Error(
      'An empty entry was supplied in --paths. An empty path resolves to the repository root and would score the whole tree as one module.',
    );
  }
  if (lineCoverages.length !== paths.length) {
    throw new Error(
      `--lineCoverages must supply one entry per path (${paths.length} paths, ${lineCoverages.length} coverage values)`,
    );
  }
  if (complexities.length > 0 && complexities.length !== paths.length) {
    throw new Error(
      `--complexities must be empty or supply one entry per path (${paths.length} paths, ${complexities.length} complexity values)`,
    );
  }
  if (branchCoverages.length > 0 && branchCoverages.length !== paths.length) {
    throw new Error(
      `--branchCoverages must be empty or supply one entry per path (${paths.length} paths, ${branchCoverages.length} branch-coverage values)`,
    );
  }

  const resolved = [];
  const unresolved = [];

  paths.forEach((path, index) => {
    try {
      const changeFrequency = computeChangeFrequency(repoPath, path, { since, followRenames });
      if (changeFrequency == null) {
        throw new Error(
          `"${path}" has no commit history in this repository (untracked, newly added, or renamed without --followRenames). Change frequency is unknown, not zero.`,
        );
      }

      const explicitComplexity = complexities[index];
      const complexity = computeComplexityProxy(join(repoPath, path), {
        explicitComplexity:
          explicitComplexity !== undefined && explicitComplexity !== ''
            ? explicitComplexity
            : undefined,
      });

      const branchCoverageEntry = branchCoverages[index];
      const scored = computeHotspotScore({
        changeFrequency,
        complexity: complexity.value,
        lineCoveragePercent: lineCoverages[index],
        branchCoveragePercent:
          branchCoverageEntry !== undefined && branchCoverageEntry !== ''
            ? branchCoverageEntry
            : undefined,
        allowLineOnly,
      });

      resolved.push({
        path,
        ...scored,
        complexitySource: complexity.source,
      });
    } catch (error) {
      unresolved.push({ path, reason: error.message });
    }
  });

  return {
    repoPath,
    since: since ?? null,
    ranked: rankModules(resolved),
    unresolved,
  };
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const result = rankHotspots({
      repoPath: typeof args.repoPath === 'string' ? args.repoPath : undefined,
      paths: splitCsv(args.paths),
      lineCoverages: splitCsv(args.lineCoverages),
      complexities: splitCsv(args.complexities),
      branchCoverages: splitCsv(args.branchCoverages),
      since: typeof args.since === 'string' ? args.since : undefined,
      followRenames: args.followRenames === true,
      allowLineOnly: args.allowLineOnly === true,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    // Nothing ranked plus something unresolved is a total measurement failure.
    // Exiting 0 there lets a wrapper read it as "no work needed".
    if (result.ranked.length === 0 && result.unresolved.length > 0) {
      process.stderr.write(
        `hotspot-rank: 0 of ${result.unresolved.length} module(s) could be scored. This is missing evidence, not an empty backlog.\n`,
      );
      process.exitCode = EXIT_CODES.NOTHING_RANKED;
      return;
    }
    if (result.unresolved.length > 0) {
      process.stderr.write(
        `hotspot-rank: ${result.unresolved.length} of ${result.ranked.length + result.unresolved.length} module(s) unresolved; treat each as Missing Evidence.\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: 'BAD_ARGS', message: error.message }, null, 2)}\n`);
    process.exitCode = EXIT_CODES.BAD_ARGS;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
