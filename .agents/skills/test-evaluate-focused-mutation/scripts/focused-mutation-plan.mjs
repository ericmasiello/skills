import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
    case 'c':
      return [...common, 'Clang build command', 'Mull target filter'];
    default:
      return common;
  }
}

function commandFor(platform, tool, productionTargets) {
  const firstTarget = productionTargets[0] ?? '<target>';
  const quotedTargets = productionTargets.map((target) => `"${target}"`).join(',');

  switch (platform) {
    case 'javascript':
      return `npm exec -- stryker run --mutate ${quotedTargets || '"<target>"'}`;
    case 'python':
      return tool === 'cosmic-ray'
        ? 'cosmic-ray exec <prepared-config.toml> <session.sqlite>'
        : `mutmut run --paths-to-mutate ${firstTarget}`;
    case 'java':
      return `Run PIT with targetClasses/targetTests scoped to ${firstTarget}`;
    case 'csharp':
      return `dotnet tool run dotnet-stryker -- -m "${firstTarget}"`;
    case 'go':
      return `go-mutesting ${firstTarget}`;
    case 'rust':
      return `cargo mutants --file ${firstTarget}`;
    case 'c':
      return `mull-cxx --mutate ${firstTarget} -- <target-test-command>`;
    default:
      return 'Manual mutation command required';
  }
}

/**
 * Resolve the mutation gate.
 *
 * The gate belongs to `test-quality-policy.md`, which permits a project to set
 * its own. Hardcoding it here put a policy number in shipped code, where no
 * documentation edit could reach it.
 */
function resolveGate(rawGate) {
  if (rawGate == null || rawGate === true || String(rawGate).trim() === '') {
    return { value: 85, source: 'policy default' };
  }
  const value = Number(String(rawGate).trim());
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`mutationGate must be a number between 0 and 100, got ${JSON.stringify(rawGate)}`);
  }
  return { value, source: 'project gate' };
}

export function createFocusedMutationPlan(input) {
  const productionTargets = splitCsv(input.productionTargets ?? input.targets);
  const changedTests = splitCsv(input.changedTests ?? input.tests);
  const taxonomyLevel = input.taxonomyLevel ?? 'unit';
  const targetKind = input.targetKind ?? 'file';
  const readiness =
    input.readiness ?? assessMutationReadiness(input.repoPath ?? '.', { checkCommands: true });
  const selectedScope = detectScope({ productionTargets, taxonomyLevel, targetKind });
  const gate = resolveGate(input.mutationGate ?? input.gate);
  // Item 4: a plan must not present a runnable command when the tool is absent.
  // The command is the thing an agent copies; emitting one implies readiness.
  const toolUnavailable = readiness.readiness === 'missing-tool' || readiness.readiness === 'target-not-found';
  const unverified = readiness.readiness === 'declared-unverified';

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
    command: toolUnavailable ? null : commandFor(readiness.platform, readiness.tool, productionTargets),
    runnable: !toolUnavailable,
    blockingReason: toolUnavailable
      ? `Mutation tooling is ${readiness.readiness} for this target, so no runnable command was emitted. Report this as Missing Evidence and route the setup path to a human; do not invent a score.`
      : unverified
        ? `Mutation tooling is declared but unverified. Run "${readiness.verifyCommand}" before trusting a score from this command.`
        : null,
    qualityGate: `mutation score >= ${gate.value}%`,
    mutationGate: gate.value,
    mutationGateSource: gate.source,
    // The plan produces evidence; this names the evaluator that adjudicates it,
    // so the gate is enforced by code rather than asserted in prose.
    gateEvaluator: `node .skills/test-evaluate-focused-mutation/scripts/evaluate-mutation-report.mjs --filePath <report> --gate ${gate.value} --target <target> --sourceRevision <revision> --command <command> --triage <triage.json>`,
    setupActions: toolUnavailable
      ? {
          installCommand: readiness.installCommand,
          verifyCommand: readiness.verifyCommand,
          configShape: readiness.configShape,
        }
      : 'Reuse existing mutation setup',
  };
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const plan = createFocusedMutationPlan(args);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    // A plan that cannot be run must not exit 0.
    if (!plan.runnable) process.exitCode = 3;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: 'BAD_ARGS', message: error.message }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
