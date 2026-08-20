import { basename } from 'node:path';
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

function detectScope({ changedTests, productionTargets, taxonomyLevel }) {
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

function testCommandFor(platform, changedTests) {
  const firstTest = changedTests[0] ?? '<test-file>';
  switch (platform) {
    case 'javascript':
      return `pnpm exec vitest run ${changedTests.join(' ') || '<test-file>'}`;
    case 'python':
      return `pytest ${changedTests.join(' ') || '<test-path>'}`;
    case 'java':
      return `Run the build tool test task filtered to ${firstTest}`;
    case 'csharp':
      return `dotnet test --filter FullyQualifiedName~<test-name-or-class>`;
    case 'go':
      return `go test ${changedTests.join(' ') || './...'} `;
    case 'rust':
      return `cargo test ${firstTest}`;
    default:
      return 'Manual targeted test command required';
  }
}

function coverageCommandFor(platform, changedTests, productionTargets) {
  const firstTarget = productionTargets[0] ?? '<target>';
  const tests = changedTests.join(' ');
  switch (platform) {
    case 'javascript':
      return `pnpm exec vitest run --coverage ${tests || '<test-file>'}`;
    case 'python':
      return `pytest --cov ${firstTarget} ${tests || '<test-path>'}`;
    case 'java':
      return `Run JaCoCo-enabled test task scoped to ${firstTarget}`;
    case 'csharp':
      return 'dotnet test --collect:"XPlat Code Coverage"';
    case 'go':
      return `go test -coverprofile=coverage.out ${firstTarget}`;
    case 'rust':
      return `cargo llvm-cov ${tests || ''}`.trim();
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
    default:
      return common;
  }
}

export function createTargetedCoveragePlan(input) {
  const productionTargets = splitCsv(input.productionTargets ?? input.targets);
  const changedTests = splitCsv(input.changedTests ?? input.tests);
  const taxonomyLevel = input.taxonomyLevel ?? 'unit';
  const readiness =
    input.readiness ?? assessTestCoverageReadiness(input.repoPath ?? '.', { checkCommands: false });
  const selectedScope = detectScope({ changedTests, productionTargets, taxonomyLevel });

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
    testCommand: testCommandFor(readiness.platform, changedTests),
    coverageCommand: coverageCommandFor(readiness.platform, changedTests, productionTargets),
    coverageExpectations: 'line coverage required; branch coverage when the platform supports it',
    setupActions:
      readiness.readiness === 'missing-tool'
        ? {
            installCommand: readiness.installCommand,
            verifyCommand: readiness.verifyCommand,
            configShape: readiness.configShape,
          }
        : 'Reuse existing test and coverage setup',
  };
}

function main() {
  const args = parseArgs(process.argv);
  const result = createTargetedCoveragePlan(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (basename(process.argv[1] ?? '') === 'targeted-coverage-plan.mjs') {
  main();
}
