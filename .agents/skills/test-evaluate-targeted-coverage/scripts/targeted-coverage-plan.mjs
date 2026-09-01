import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assessTestCoverageReadiness } from './test-coverage-readiness.mjs';

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

function detectScope({ changedTests, productionTargets, taxonomyLevel, targetKind }) {
  if (['flow', 'boundary'].includes(targetKind)) return 'flow';
  if (['function', 'method', 'single-test'].includes(targetKind)) return 'single-test';
  if (['package', 'namespace'].includes(targetKind)) return 'package';
  if (['acceptance', 'integration', 'contract', 'e2e'].includes(taxonomyLevel)) {
    return 'flow';
  }
  if (changedTests.length <= 1) {
    return 'single-test';
  }
  if (productionTargets.length <= 1) {
    return 'file/module';
  }
  return 'package';
}

function testCommandFor(platform, changedTests, manager, runner) {
  const firstTest = changedTests[0] ?? '<test-file>';
  const goPackage = firstTest.includes('/') ? `./${firstTest.slice(0, firstTest.lastIndexOf('/'))}` : './...';
  switch (platform) {
    case 'javascript':
      if (runner === 'Jest') {
        return manager === 'npm'
          ? `npm exec -- jest --runInBand --runTestsByPath ${changedTests.join(' ') || '<test-file>'}`
          : `${manager} exec jest --runInBand --runTestsByPath ${changedTests.join(' ') || '<test-file>'}`;
      }
      return manager === 'npm'
        ? `npm exec -- vitest run ${changedTests.join(' ') || '<test-file>'}`
        : `${manager} exec vitest run ${changedTests.join(' ') || '<test-file>'}`;
    case 'python':
      return `pytest ${changedTests.join(' ') || '<test-path>'}`;
    case 'java':
      return `Run the build tool test task filtered to ${firstTest}`;
    case 'csharp':
      return `dotnet test --filter FullyQualifiedName~<test-name-or-class>`;
    case 'go':
      return `go test ${goPackage}`;
    case 'rust':
      return `cargo test ${firstTest}`;
    case 'c':
      return 'ctest --test-dir build --output-on-failure';
    default:
      return 'Manual targeted test command required';
  }
}

function coverageCommandFor(platform, changedTests, productionTargets, manager, runner) {
  const firstTarget = productionTargets[0] ?? '<target>';
  const tests = changedTests.join(' ');
  const pythonTarget = firstTarget.replace(/^src\//, '').replace(/\.py$/, '').replaceAll('/', '.');
  const goPackage = firstTarget.includes('/') ? `./${firstTarget.slice(0, firstTarget.lastIndexOf('/'))}` : './...';
  switch (platform) {
    case 'javascript':
      if (runner === 'Jest') {
        return manager === 'npm'
          ? `npm exec -- jest --coverage --runInBand --runTestsByPath ${tests || '<test-file>'}`
          : `${manager} exec jest --coverage --runInBand --runTestsByPath ${tests || '<test-file>'}`;
      }
      return manager === 'npm'
        ? `npm exec -- vitest run --coverage ${tests || '<test-file>'}`
        : `${manager} exec vitest run --coverage ${tests || '<test-file>'}`;
    case 'python':
      return `pytest --cov=${pythonTarget} --cov-branch ${tests || '<test-path>'}`;
    case 'java':
      return `Run JaCoCo-enabled test task scoped to ${firstTarget}`;
    case 'csharp':
      return 'dotnet test --filter FullyQualifiedName~<test-name-or-class> --collect:"XPlat Code Coverage"';
    case 'go':
      return `go test -coverprofile=coverage.out ${goPackage}`;
    case 'rust':
      return `cargo llvm-cov ${tests || ''}`.trim();
    case 'c':
      return 'ctest --test-dir build --output-on-failure && gcovr --xml-pretty -o coverage.xml';
    default:
      return 'Manual targeted coverage command required';
  }
}

function configShapeFor(platform, scope) {
  const common = [`focused ${scope} coverage scope`];
  switch (platform) {
    case 'javascript':
      return [...common, 'coverage provider', 'test file filter', 'reporter selection'];
    case 'python':
      return [...common, '--cov target', 'test path filter'];
    case 'java':
      return [...common, 'JaCoCo plugin', 'test filter'];
    case 'csharp':
      return [...common, 'coverage collector', 'test project/filter'];
    case 'go':
      return [...common, 'package path', 'coverprofile'];
    case 'rust':
      return [...common, 'coverage tool', 'crate/test selection'];
    case 'c':
      return [...common, 'CTest target', 'compiler coverage flags', 'gcovr report'];
    default:
      return common;
  }
}

export function createTargetedCoveragePlan(input) {
  const productionTargets = splitCsv(input.productionTargets ?? input.targets);
  const changedTests = splitCsv(input.changedTests ?? input.tests);
  const taxonomyLevel = input.taxonomyLevel ?? 'unit';
  const targetKind = input.targetKind ?? 'file';
  const readiness = input.readiness ?? assessTestCoverageReadiness(input.repoPath ?? '.');
  const selectedScope = detectScope({ changedTests, productionTargets, taxonomyLevel, targetKind });
  // A plan must not present a runnable command when the tooling is absent. The
  // command is what an agent copies, so emitting one implies readiness.
  const toolUnavailable = readiness.readiness === 'missing-tool' || readiness.readiness === 'target-not-found';
  const unverified = readiness.readiness === 'declared-unverified';

  return {
    platform: readiness.platform,
    testRunner: readiness.testRunner,
    coverageTool: readiness.coverageTool,
    environmentReadiness: readiness.readiness,
    productionTargets,
    changedTests,
    selectedScope,
    scopeRationale:
      selectedScope === 'flow'
        ? 'Higher-level characterization requires a focused flow-level coverage run.'
        : selectedScope === 'single-test'
          ? 'A single changed test file is the narrowest stable slice.'
          : selectedScope === 'file/module'
            ? 'One production module is protected by a small related test slice.'
            : 'Several related targets require a containing package-level coverage run.',
    configShape: configShapeFor(readiness.platform, selectedScope),
    testCommand: toolUnavailable
      ? null
      : testCommandFor(readiness.platform, changedTests, readiness.packageManager ?? 'npm', readiness.testRunner),
    coverageCommand: toolUnavailable
      ? null
      : coverageCommandFor(readiness.platform, changedTests, productionTargets, readiness.packageManager ?? 'npm', readiness.testRunner),
    runnable: !toolUnavailable,
    blockingReason: toolUnavailable
      ? `Coverage tooling is ${readiness.readiness} for this target, so no runnable command was emitted. Report this as Missing Evidence and route the setup path to a human; do not invent a number.`
      : unverified
        ? `Coverage tooling is declared but unverified. Run "${readiness.verifyCommand}" before trusting a number from this command.`
        : null,
    coverageExpectations: 'line coverage required; branch coverage when the platform supports it',
    // The plan produces evidence; this names the evaluator that adjudicates it,
    // so the gate is enforced by code rather than asserted in prose.
    gateEvaluator:
      'node .skills/test-evaluate-targeted-coverage/scripts/evaluate-coverage-gate.mjs --filePath <report> --lineGate <line> --branchGate <branch|n/a> --target <target> --sourceRevision <revision> --command <command>',
    setupActions: toolUnavailable
      ? {
          installCommand: readiness.installCommand,
          verifyCommand: readiness.verifyCommand,
          configShape: readiness.configShape,
        }
      : 'Reuse existing test and coverage setup',
  };
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const result = createTargetedCoveragePlan(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.runnable) process.exitCode = 3;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: 'BAD_ARGS', message: error.message }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  main();
}
