import { basename } from 'node:path';
import { assessMutationReadiness } from './mutation-readiness.mjs';

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
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectScope({ productionTargets, taxonomyLevel, targetKind }) {
  if (['acceptance', 'integration', 'contract', 'e2e'].includes(taxonomyLevel)) {
    return 'flow';
  }
  if (targetKind === 'function' || targetKind === 'method') {
    return 'function-adjacent';
  }
  if (productionTargets.length <= 1) {
    return 'file/module';
  }
  return 'package';
}

function configShapeFor(platform, scope) {
  const common = [`focused ${scope} mutation scope`];

  switch (platform) {
    case 'javascript':
      return [...common, 'mutate globs', 'test runner', 'coverage analysis mode if required'];
    case 'python':
      return [...common, 'target module/package', 'test command'];
    case 'java':
      return [...common, 'targetClasses', 'targetTests'];
    case 'csharp':
      return [...common, 'project selection', 'path or mutation filters'];
    case 'go':
      return [...common, 'target package path', 'go test flags'];
    case 'rust':
      return [...common, 'crate/package selection', 'file or function filters'];
    default:
      return common;
  }
}

function commandFor(platform, tool, productionTargets) {
  const firstTarget = productionTargets[0] ?? '<target>';
  const quotedTargets = productionTargets.map((target) => `"${target}"`).join(',');

  switch (platform) {
    case 'javascript':
      return `pnpm exec stryker run --mutate ${quotedTargets || '"<target>"'}`;
    case 'python':
      return tool === 'cosmic-ray'
        ? `cosmic-ray init --target-module ${firstTarget} && cosmic-ray exec`
        : `mutmut run --paths-to-mutate ${firstTarget}`;
    case 'java':
      return `Run PIT with targetClasses/targetTests scoped to ${firstTarget}`;
    case 'csharp':
      return 'dotnet stryker --project <test-project> --solution <solution-or-project>';
    case 'go':
      return `go-mutesting ${firstTarget}`;
    case 'rust':
      return `cargo mutants --file ${firstTarget}`;
    default:
      return 'Manual mutation command required';
  }
}

export function createFocusedMutationPlan(input) {
  const productionTargets = splitCsv(input.productionTargets ?? input.targets);
  const changedTests = splitCsv(input.changedTests ?? input.tests);
  const taxonomyLevel = input.taxonomyLevel ?? 'unit';
  const targetKind = input.targetKind ?? 'file';
  const readiness =
    input.readiness ?? assessMutationReadiness(input.repoPath ?? '.', { checkCommands: false });
  const selectedScope = detectScope({ productionTargets, taxonomyLevel, targetKind });

  return {
    platform: readiness.platform,
    tool: readiness.tool,
    environmentReadiness: readiness.readiness,
    productionTargets,
    changedTests,
    selectedScope,
    scopeRationale:
      selectedScope === 'flow'
        ? 'Higher-level characterization requires mutating the narrowest owning flow boundary.'
        : selectedScope === 'function-adjacent'
          ? 'A single local behavior can be validated with the smallest adjacent mutation scope.'
          : productionTargets.length <= 1
            ? 'One production file/module is the narrowest practical mutation scope.'
            : 'Several related production targets require a containing package-level mutation scope.',
    configShape: configShapeFor(readiness.platform, selectedScope),
    command: commandFor(readiness.platform, readiness.tool, productionTargets),
    qualityGate: 'mutation score >= 85%',
    setupActions:
      readiness.readiness === 'missing-tool'
        ? {
            installCommand: readiness.installCommand,
            verifyCommand: readiness.verifyCommand,
            configShape: readiness.configShape,
          }
        : 'Reuse existing mutation setup',
  };
}

function main() {
  const args = parseArgs(process.argv);
  const plan = createFocusedMutationPlan(args);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (basename(process.argv[1] ?? '') === 'focused-mutation-plan.mjs') {
  main();
}
