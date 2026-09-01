import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const JS_TEST_CONFIG_FILES = [
  'vitest.config.ts',
  'vitest.config.js',
  'jest.config.js',
  'jest.config.ts',
];
const JS_COVERAGE_PACKAGES = ['@vitest/coverage-v8', '@vitest/coverage-istanbul', 'nyc'];
const JAVA_BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts'];

function safeRead(filePath) {
  try {
    return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

/** Parse JSON that may be absent or malformed, without aborting the audit. */
function safeParseJson(raw, warnings, label) {
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    warnings.push(`${label} is present but not valid JSON (${error.message}); declarations were not read.`);
    return {};
  }
}

/** Strip comments before matching a declaration; a commented-out mention is not one. */
function withoutComments(text, style) {
  if (style === 'xml') return text.replace(/<!--[\s\S]*?-->/g, ' ');
  if (style === 'hash') return text.replace(/(^|\s)#[^\n]*/g, ' ');
  if (style === 'slash') return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
  return text;
}

function hasAnyFile(rootDir, candidates) {
  return candidates.some((fileName) => existsSync(join(rootDir, fileName)));
}

function findFilesByExtension(rootDir, extension, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth || !existsSync(rootDir)) {
    return [];
  }

  const results = [];
  let entries;
  try {
    // withFileTypes avoids a per-entry statSync, which throws on a dangling
    // symlink and would abort the whole readiness assessment.
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }
      results.push(...findFilesByExtension(fullPath, extension, maxDepth, currentDepth + 1));
      continue;
    }

    if (entry.isFile() && extname(entry.name) === extension) {
      results.push(fullPath);
    }
  }

  return results;
}

function commandAvailable(command, args, cwd, options = {}) {
  if (options.checkCommands === false) {
    return false;
  }

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'ignore',
    timeout: options.probeTimeoutMs ?? 10_000,
    killSignal: 'SIGKILL',
  });

  return !result.error && result.status === 0;
}

function packageManager(repoPath) {
  if (existsSync(join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(repoPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Detect EVERY platform present so a polyglot repository is not silently
 * classified as whichever manifest happened to be checked first.
 */
function detectPlatforms(repoPath) {
  const platforms = [];
  if (existsSync(join(repoPath, 'package.json'))) platforms.push('javascript');
  if (
    existsSync(join(repoPath, 'pyproject.toml')) ||
    existsSync(join(repoPath, 'setup.cfg')) ||
    existsSync(join(repoPath, 'setup.py')) ||
    existsSync(join(repoPath, 'requirements.txt'))
  ) {
    platforms.push('python');
  }
  if (hasAnyFile(repoPath, JAVA_BUILD_FILES)) platforms.push('java');
  if (findFilesByExtension(repoPath, '.csproj').length > 0) platforms.push('csharp');
  if (existsSync(join(repoPath, 'go.mod'))) platforms.push('go');
  if (existsSync(join(repoPath, 'Cargo.toml'))) platforms.push('rust');
  if (existsSync(join(repoPath, 'CMakeLists.txt'))) platforms.push('c');
  return platforms;
}

function detectJavascript(repoPath, options, warnings = []) {
  const packageJson = safeParseJson(safeRead(join(repoPath, 'package.json')), warnings, 'package.json');
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const scripts = packageJson.scripts ?? {};
  const hasVitest = Boolean(deps.vitest);
  const hasJest = Boolean(deps.jest);
  let testRunner = 'Vitest';
  if (hasJest && !hasVitest) {
    testRunner = 'Jest';
  }
  const manager = packageManager(repoPath);
  const runner = hasVitest ? 'vitest' : hasJest ? 'jest' : null;
  const runnerArgs = manager === 'npm'
    ? ['exec', '--', runner, '--version']
    : manager === 'pnpm'
      ? ['exec', runner, '--version']
      : [runner, '--version'];
  const testInstalled = Boolean(runner) && commandAvailable(manager, runnerArgs, repoPath, options);
  const testConfigured =
    JS_TEST_CONFIG_FILES.some((fileName) => existsSync(join(repoPath, fileName))) ||
    Boolean(scripts.test);
  let coverageTool = '@vitest/coverage-v8';
  if (deps['@vitest/coverage-istanbul']) {
    coverageTool = '@vitest/coverage-istanbul';
  } else if (hasJest && !deps['@vitest/coverage-v8']) {
    coverageTool = 'Jest/Istanbul';
  }
  // Jest bundles coverage, but "jest is present" is not evidence that coverage
  // is wired up; require an explicit signal either way.
  const coverageInstalled = hasJest
    ? testInstalled
    : testInstalled && JS_COVERAGE_PACKAGES.some((pkg) => Boolean(deps[pkg]));
  const configText = JS_TEST_CONFIG_FILES.map((fileName) =>
    safeRead(join(repoPath, fileName)),
  ).join('\n');
  const coverageConfigured =
    /coverage\s*:/i.test(configText) ||
    /collectCoverage|coverageReporters|coverageThreshold/i.test(configText) ||
    /--coverage/.test(Object.values(scripts).join(' '));
  let installCommand = `${manager} ${manager === 'npm' ? 'install' : 'add'} -D vitest @vitest/coverage-v8`;
  if (hasVitest) {
    installCommand = `${manager} ${manager === 'npm' ? 'install' : 'add'} -D @vitest/coverage-v8`;
  } else if (hasJest) {
    installCommand = 'Use Jest built-in coverage or add nyc if needed';
  }
  let verifyCommand = manager === 'npm' ? 'npm exec -- vitest --version' : `${manager} exec vitest --version`;
  if (hasJest && !hasVitest) {
    verifyCommand = manager === 'npm' ? 'npm exec -- jest --version' : `${manager} exec jest --version`;
  }

  return {
    platform: 'javascript',
    packageManager: manager,
    testRunner,
    coverageTool,
    testInstalled,
    testConfigured,
    coverageInstalled,
    coverageConfigured,
    installCommand,
    verifyCommand,
    configShape: [
      'test runner config file',
      'coverage provider',
      'coverage include/exclude',
      'targeted test file filter',
    ],
  };
}

function detectPython(repoPath, options) {
  const combined = withoutComments(
    [
      safeRead(join(repoPath, 'pyproject.toml')),
      safeRead(join(repoPath, 'setup.cfg')),
      safeRead(join(repoPath, 'requirements.txt')),
    ].join('\n'),
    'hash',
  );
  const testDeclared = /pytest/i.test(combined);
  const testInstalled = testDeclared && commandAvailable('pytest', ['--version'], repoPath, options);
  // pytest-cov is a separate plugin; a working pytest proves nothing about it.
  const coverageDeclared = /pytest-cov/i.test(combined);
  const coverageInstalled =
    coverageDeclared &&
    commandAvailable('python', ['-c', 'import pytest_cov'], repoPath, options);
  const coverageConfigured = /--cov|\[tool\.pytest|\[pytest\]/i.test(combined);

  return {
    platform: 'python',
    testRunner: 'pytest',
    coverageTool: 'pytest-cov',
    testInstalled,
    testConfigured: testInstalled,
    coverageInstalled,
    coverageConfigured,
    installCommand: 'pip install pytest pytest-cov',
    verifyCommand: 'pytest --version',
    configShape: ['pytest command', '--cov target', 'optional branch coverage flag'],
  };
}

function detectJava(repoPath, options) {
  const pom = withoutComments(safeRead(join(repoPath, 'pom.xml')), 'xml');
  const gradle = withoutComments(
    [safeRead(join(repoPath, 'build.gradle')), safeRead(join(repoPath, 'build.gradle.kts'))].join('\n'),
    'slash',
  );
  const combined = `${pom}\n${gradle}`;
  const hasMaven = existsSync(join(repoPath, 'pom.xml'));
  const testInstalled = hasMaven
    ? commandAvailable('mvn', ['-q', '-version'], repoPath, options)
    : commandAvailable('gradle', ['-version'], repoPath, options);
  const coverageInstalled = /jacoco/i.test(combined);

  return {
    platform: 'java',
    testRunner: hasMaven ? 'Maven test' : 'Gradle test',
    coverageTool: 'JaCoCo',
    testInstalled,
    testConfigured: hasMaven || /test/i.test(combined),
    coverageInstalled,
    coverageConfigured: /jacoco/i.test(combined),
    installCommand: hasMaven
      ? 'Add JaCoCo Maven plugin to pom.xml'
      : 'Add JaCoCo plugin to build.gradle(.kts)',
    verifyCommand: hasMaven ? 'mvn -q test' : 'gradle test',
    configShape: ['test task/goal', 'JaCoCo plugin', 'report generation task'],
  };
}

function detectCSharp(repoPath, options) {
  const csprojContent = findFilesByExtension(repoPath, '.csproj')
    .map((filePath) => withoutComments(safeRead(filePath), 'xml'))
    .join('\n');
  const testInstalled = commandAvailable('dotnet', ['--version'], repoPath, options);
  const coverageDeclared = /coverlet|XPlat Code Coverage/i.test(csprojContent);
  const coverageInstalled = coverageDeclared && testInstalled;

  return {
    platform: 'csharp',
    testRunner: 'dotnet test',
    coverageTool: 'coverlet',
    testInstalled,
    testConfigured: testInstalled,
    coverageInstalled,
    coverageConfigured: coverageInstalled,
    installCommand: 'Add coverlet.collector or use dotnet test --collect:"XPlat Code Coverage"',
    verifyCommand: 'dotnet --version',
    configShape: ['test project selection', 'coverage collector', 'output format'],
  };
}

function detectGo(repoPath, options) {
  const hasGoMod = existsSync(join(repoPath, 'go.mod'));
  // go.mod presence was already required to reach this branch, so it proved
  // nothing. Only the toolchain probe does.
  const testInstalled = commandAvailable('go', ['version'], repoPath, options);

  return {
    platform: 'go',
    testRunner: 'go test',
    coverageTool: 'go test -cover',
    testInstalled,
    testConfigured: hasGoMod,
    coverageInstalled: testInstalled,
    coverageConfigured: hasGoMod,
    installCommand: 'No extra install required beyond Go toolchain',
    verifyCommand: 'go version',
    configShape: ['package path', 'coverprofile output', 'targeted package selection'],
  };
}

function detectRust(repoPath, options) {
  const cargoToml = withoutComments(safeRead(join(repoPath, 'Cargo.toml')), 'hash');
  const testInstalled = commandAvailable('cargo', ['--version'], repoPath, options);
  const coverageInstalled =
    /cargo-llvm-cov/i.test(cargoToml) ||
    commandAvailable('cargo', ['llvm-cov', '--version'], repoPath, options);

  return {
    platform: 'rust',
    testRunner: 'cargo test',
    coverageTool: 'cargo-llvm-cov',
    testInstalled,
    testConfigured: testInstalled,
    coverageInstalled,
    coverageConfigured: coverageInstalled,
    installCommand: 'cargo install cargo-llvm-cov',
    verifyCommand: 'cargo --version',
    configShape: ['crate/package selection', 'coverage output format', 'targeted test selection'],
  };
}

function detectC(repoPath, options) {
  const cmake = withoutComments(safeRead(join(repoPath, 'CMakeLists.txt')), 'hash');
  const testInstalled = commandAvailable('ctest', ['--version'], repoPath, options);
  const coverageInstalled = commandAvailable('gcovr', ['--version'], repoPath, options);
  return {
    platform: 'c',
    testRunner: 'CTest',
    coverageTool: 'gcovr',
    testInstalled,
    testConfigured: /enable_testing|add_test/i.test(cmake),
    coverageInstalled,
    coverageConfigured: /--coverage|fprofile-arcs|ftest-coverage/i.test(cmake),
    installCommand: 'Install gcovr and enable compiler coverage instrumentation in CMake',
    verifyCommand: 'gcovr --version',
    configShape: ['CTest registration', 'compiler coverage flags', 'gcovr XML or text report'],
  };
}

export function assessTestCoverageReadiness(repoPath = '.', options = {}) {
  const resolvedRepoPath = resolve(repoPath);
  const warnings = [];

  if (!existsSync(resolvedRepoPath)) {
    return {
      repoPath: resolvedRepoPath,
      platform: 'unknown',
      platforms: [],
      packageManager: null,
      testRunner: null,
      coverageTool: null,
      readiness: 'target-not-found',
      probed: false,
      testInstalled: false,
      coverageInstalled: false,
      testConfigured: false,
      coverageConfigured: false,
      installCommand: null,
      verifyCommand: null,
      configShape: [],
      warnings: [`The path "${resolvedRepoPath}" does not exist. This is a bad target, not a missing tool.`],
    };
  }

  const platforms = detectPlatforms(resolvedRepoPath);
  const platform = platforms[0] ?? 'unknown';
  if (platforms.length > 1) {
    warnings.push(
      `Multiple platforms detected at this path (${platforms.join(', ')}); "${platform}" was assessed. Point the audit at a single sub-project, or pass the target explicitly.`,
    );
  }

  let detection;
  switch (platform) {
    case 'javascript':
      detection = detectJavascript(resolvedRepoPath, options, warnings);
      break;
    case 'python':
      detection = detectPython(resolvedRepoPath, options);
      break;
    case 'java':
      detection = detectJava(resolvedRepoPath, options);
      break;
    case 'csharp':
      detection = detectCSharp(resolvedRepoPath, options);
      break;
    case 'go':
      detection = detectGo(resolvedRepoPath, options);
      break;
    case 'rust':
      detection = detectRust(resolvedRepoPath, options);
      break;
    case 'c':
      detection = detectC(resolvedRepoPath, options);
      break;
    default:
      detection = {
        platform: 'unknown',
        testRunner: null,
        coverageTool: null,
        testInstalled: false,
        testConfigured: false,
        coverageInstalled: false,
        coverageConfigured: false,
        installCommand: null,
        verifyCommand: null,
        configShape: [],
      };
  }

  const probed = options.checkCommands !== false;
  const installed = detection.testInstalled && detection.coverageInstalled;
  const configured = detection.testConfigured && detection.coverageConfigured;
  let readiness = 'missing-tool';
  if (installed) {
    readiness = configured ? 'installed and configured' : 'installed-needs-config';
  } else if (!probed && (detection.testConfigured || detection.coverageConfigured)) {
    readiness = 'declared-unverified';
  }

  return {
    repoPath: resolvedRepoPath,
    platform: detection.platform,
    platforms,
    packageManager: detection.packageManager ?? null,
    testRunner: detection.testRunner,
    coverageTool: detection.coverageTool,
    readiness,
    probed,
    testInstalled: detection.testInstalled,
    coverageInstalled: detection.coverageInstalled,
    testConfigured: detection.testConfigured,
    coverageConfigured: detection.coverageConfigured,
    installCommand: detection.installCommand,
    verifyCommand: detection.verifyCommand,
    configShape: detection.configShape,
    warnings,
  };
}

export const EXIT_CODES = {
  OK: 0,
  CRASH: 1,
  TOOL_MISSING: 3,
  TARGET_NOT_FOUND: 4,
};

function main() {
  try {
    const repoPath = process.argv[2] ?? '.';
    const result = assessTestCoverageReadiness(repoPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.readiness === 'target-not-found') {
      process.exitCode = EXIT_CODES.TARGET_NOT_FOUND;
      return;
    }
    if (result.readiness === 'missing-tool' || result.readiness === 'declared-unverified') {
      process.exitCode = EXIT_CODES.TOOL_MISSING;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: 'UNEXPECTED_ERROR', message: error.message }, null, 2)}\n`);
    process.exitCode = EXIT_CODES.CRASH;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
