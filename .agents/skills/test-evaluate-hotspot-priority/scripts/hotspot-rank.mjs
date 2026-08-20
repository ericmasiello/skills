import { basename, join, resolve } from 'node:path';
import { computeChangeFrequency } from './change-frequency.mjs';
import { computeComplexityProxy } from './complexity-proxy.mjs';

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

function splitCsv(value) {
  if (!value || value === true) {
    return [];
  }
  return String(value)
    .split(',')
    .map((entry) => entry.trim());
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
 * coverage is "missing evidence", not a silent 0%.
 *
 * @param {{ changeFrequency: number, complexity: number, lineCoveragePercent: number, branchCoveragePercent?: number }} input
 */
export function computeHotspotScore({
  changeFrequency,
  complexity,
  lineCoveragePercent,
  branchCoveragePercent,
}) {
  if (changeFrequency == null || !Number.isFinite(Number(changeFrequency))) {
    throw new Error('changeFrequency is required and must be a finite number');
  }
  if (complexity == null || !Number.isFinite(Number(complexity))) {
    throw new Error('complexity is required and must be a finite number');
  }
  if (lineCoveragePercent == null || !Number.isFinite(Number(lineCoveragePercent))) {
    throw new Error('lineCoveragePercent is required and must be a finite number (0-100)');
  }

  const coveragePercent = Number(lineCoveragePercent);
  if (coveragePercent < 0 || coveragePercent > 100) {
    throw new Error(`lineCoveragePercent must be between 0 and 100, got ${coveragePercent}`);
  }

  const hasBranchInput = branchCoveragePercent != null && branchCoveragePercent !== '';
  let branchCoverageValue = null;
  let uncoveredBranchFraction = null;
  if (hasBranchInput) {
    branchCoverageValue = Number(branchCoveragePercent);
    if (!Number.isFinite(branchCoverageValue)) {
      throw new Error(`branchCoveragePercent must be a finite number, got ${branchCoveragePercent}`);
    }
    if (branchCoverageValue < 0 || branchCoverageValue > 100) {
      throw new Error(`branchCoveragePercent must be between 0 and 100, got ${branchCoverageValue}`);
    }
    uncoveredBranchFraction = 1 - branchCoverageValue / 100;
  }

  const changeFrequencyValue = Number(changeFrequency);
  const complexityValue = Number(complexity);
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
 * @param {Array<{ path: string } & Record<string, unknown>>} scoredModules
 */
export function rankModules(scoredModules) {
  return [...scoredModules]
    .sort((a, b) => b.score - a.score)
    .map((module, index) => ({ rank: index + 1, ...module }));
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
 * }} input
 */
export function rankHotspots(input) {
  const repoPath = resolve(input.repoPath ?? '.');
  const paths = input.paths ?? [];
  const lineCoverages = input.lineCoverages ?? [];
  const complexities = input.complexities ?? [];
  const branchCoverages = input.branchCoverages ?? [];
  const since = input.since;

  if (paths.length === 0) {
    throw new Error('At least one module path is required (--paths)');
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
      const changeFrequency = computeChangeFrequency(repoPath, path, { since });

      const explicitComplexity = complexities[index];
      const complexity = computeComplexityProxy(join(repoPath, path), {
        explicitComplexity:
          explicitComplexity !== undefined && explicitComplexity !== ''
            ? explicitComplexity
            : undefined,
      });

      const lineCoveragePercent = lineCoverages[index];
      const branchCoverageEntry = branchCoverages[index];
      const branchCoveragePercent =
        branchCoverageEntry !== undefined && branchCoverageEntry !== ''
          ? branchCoverageEntry
          : undefined;
      const scored = computeHotspotScore({
        changeFrequency,
        complexity: complexity.value,
        lineCoveragePercent,
        branchCoveragePercent,
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
  const args = parseArgs(process.argv);
  const result = rankHotspots({
    repoPath: args.repoPath,
    paths: splitCsv(args.paths),
    lineCoverages: splitCsv(args.lineCoverages),
    complexities: splitCsv(args.complexities),
    branchCoverages: splitCsv(args.branchCoverages),
    since: args.since,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (basename(process.argv[1] ?? '') === 'hotspot-rank.mjs') {
  main();
}
