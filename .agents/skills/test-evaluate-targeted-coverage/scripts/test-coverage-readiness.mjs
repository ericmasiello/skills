import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
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
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function hasAnyFile(rootDir, candidates) {
  return candidates.some((fileName) => existsSync(join(rootDir, fileName)));
}

function findFilesByExtension(rootDir, extension, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth || !existsSync(rootDir)) {
    return [];
  }

  const results = [];
  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') {
        continue;
      }
      results.push(...findFilesByExtension(fullPath, extension, maxDepth, currentDepth + 1));
      continue;
    }

    if (extname(entry) === extension) {
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
    encoding: 'utf8',
    stdio: 'ignore',
  });

  return result.status === 0;
}

function detectPlatform(repoPath) {
  if (existsSync(join(repoPath, 'package.json'))) {
    return 'javascript';
  }
  if (existsSync(join(repoPath, 'pyproject.toml'))) {
    return 'python';
  }
  if (hasAnyFile(repoPath, JAVA_BUILD_FILES)) {
    return 'java';
  }
  if (findFilesByExtension(repoPath, '.csproj').length > 0) {
    return 'csharp';
  }
  if (existsSync(join(repoPath, 'go.mod'))) {
    return 'go';
  }
  if (existsSync(join(repoPath, 'Cargo.toml'))) {
    return 'rust';
  }
  return 'unknown';
}

function detectJavascript(repoPath) {
  const packageJson = JSON.parse(safeRead(join(repoPath, 'package.json')) || '{}');
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const scripts = packageJson.scripts ?? {};
  const hasVitest = Boolean(deps.vitest);
  const hasJest = Boolean(deps.jest);
  let testRunner = 'Vitest';
  if (hasJest && !hasVitest) {
    testRunner = 'Jest';
  }
  const testInstalled = hasVitest || hasJest;
  const testConfigured =
    JS_TEST_CONFIG_FILES.some((fileName) => existsSync(join(repoPath, fileName))) ||
    Boolean(scripts.test);
  let coverageTool = '@vitest/coverage-v8';
  if (deps['@vitest/coverage-istanbul']) {
    coverageTool = '@vitest/coverage-istanbul';
  } else if (hasJest && !deps['@vitest/coverage-v8']) {
    coverageTool = 'Jest/Istanbul';
  }
  const coverageInstalled = JS_COVERAGE_PACKAGES.some((pkg) => Boolean(deps[pkg])) || hasJest;
  const configText = JS_TEST_CONFIG_FILES.map((fileName) =>
    safeRead(join(repoPath, fileName)),
  ).join('\n');
  const coverageConfigured =
    /coverage\s*:/i.test(configText) || /--coverage/.test(Object.values(scripts).join(' '));
  let installCommand = 'pnpm add -D vitest @vitest/coverage-v8';
  if (hasVitest) {
    installCommand = 'pnpm add -D @vitest/coverage-v8';
  } else if (hasJest) {
    installCommand = 'Use Jest built-in coverage or add nyc if needed';
  }
  let verifyCommand = 'pnpm exec vitest --version';
  if (hasJest && !hasVitest) {
    verifyCommand = 'pnpm exec jest --version';
  }

  return {
    platform: 'javascript',
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
  const combined = [
    safeRead(join(repoPath, 'pyproject.toml')),
    safeRead(join(repoPath, 'setup.cfg')),
    safeRead(join(repoPath, 'requirements.txt')),
  ].join('\n');
  const testInstalled =
    /pytest/i.test(combined) || commandAvailable('pytest', ['--version'], repoPath, options);
  const coverageInstalled =
    /pytest-cov/i.test(combined) || commandAvailable('pytest', ['--help'], repoPath, options);
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
  const pom = safeRead(join(repoPath, 'pom.xml'));
  const gradle = [
    safeRead(join(repoPath, 'build.gradle')),
    safeRead(join(repoPath, 'build.gradle.kts')),
  ].join('\n');
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
    .map((filePath) => safeRead(filePath))
    .join('\n');
  const testInstalled = commandAvailable('dotnet', ['--version'], repoPath, options);
  const coverageInstalled = /coverlet|XPlat Code Coverage/i.test(csprojContent);

  return {
    platform: 'csharp',
    testRunner: 'dotnet test',
    coverageTool: 'coverlet',
    testInstalled,
    testConfigured: testInstalled,
    coverageInstalled,
    coverageConfigured: coverageInstalled,
    installCommand: 'Add coverlet.collector or use dotnet test --collect:"XPlat Code Coverage"',
    verifyCommand: 'dotnet test --version',
    configShape: ['test project selection', 'coverage collector', 'output format'],
  };
}

function detectGo(repoPath, options) {
  const hasGoMod = existsSync(join(repoPath, 'go.mod'));
  const testInstalled = hasGoMod || commandAvailable('go', ['version'], repoPath, options);

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
  const cargoToml = safeRead(join(repoPath, 'Cargo.toml'));
  const testInstalled =
    existsSync(join(repoPath, 'Cargo.toml')) ||
    commandAvailable('cargo', ['--version'], repoPath, options);
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

export function assessTestCoverageReadiness(repoPath = '.', options = {}) {
  const resolvedRepoPath = resolve(repoPath);
  const platform = detectPlatform(resolvedRepoPath);

  let detection;
  switch (platform) {
    case 'javascript':
      detection = detectJavascript(resolvedRepoPath);
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

  const installed = detection.testInstalled && detection.coverageInstalled;
  const configured = detection.testConfigured && detection.coverageConfigured;
  let readiness = 'missing-tool';
  if (installed) {
    readiness = configured ? 'installed and configured' : 'installed-needs-config';
  }

  return {
    repoPath: resolvedRepoPath,
    platform: detection.platform,
    testRunner: detection.testRunner,
    coverageTool: detection.coverageTool,
    readiness,
    testInstalled: detection.testInstalled,
    coverageInstalled: detection.coverageInstalled,
    testConfigured: detection.testConfigured,
    coverageConfigured: detection.coverageConfigured,
    installCommand: detection.installCommand,
    verifyCommand: detection.verifyCommand,
    configShape: detection.configShape,
  };
}

function main() {
  const repoPath = process.argv[2] ?? '.';
  const result = assessTestCoverageReadiness(repoPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (basename(process.argv[1] ?? '') === 'test-coverage-readiness.mjs') {
  main();
}
