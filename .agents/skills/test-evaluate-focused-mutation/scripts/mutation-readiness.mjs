import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const JS_CONFIG_FILES = [
  'stryker.conf.js',
  'stryker.conf.cjs',
  'stryker.conf.mjs',
  'stryker.conf.json',
  '.stryker.conf.json',
];

const JAVA_BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
const DOTNET_TOOL_MANIFEST = '.config/dotnet-tools.json';

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

function detectPlatform(repoPath) {
  const packageJsonPath = join(repoPath, 'package.json');
  const pyprojectPath = join(repoPath, 'pyproject.toml');
  const goModPath = join(repoPath, 'go.mod');
  const cargoPath = join(repoPath, 'Cargo.toml');

  if (existsSync(packageJsonPath)) {
    return 'javascript';
  }
  if (existsSync(pyprojectPath)) {
    return 'python';
  }
  if (hasAnyFile(repoPath, JAVA_BUILD_FILES)) {
    return 'java';
  }
  if (findFilesByExtension(repoPath, '.csproj').length > 0) {
    return 'csharp';
  }
  if (existsSync(goModPath)) {
    return 'go';
  }
  if (existsSync(cargoPath)) {
    return 'rust';
  }

  return 'unknown';
}

function detectJavascript(repoPath) {
  const packageJsonPath = join(repoPath, 'package.json');
  const packageJson = JSON.parse(safeRead(packageJsonPath) || '{}');
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const installed = Boolean(deps['@stryker-mutator/core']);
  const configured =
    JS_CONFIG_FILES.some((fileName) => existsSync(join(repoPath, fileName))) ||
    Boolean(packageJson.stryker);

  return {
    platform: 'javascript',
    selectedTool: 'Stryker',
    installed,
    configured,
    installCommand:
      'pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/html-reporter',
    verifyCommand: 'pnpm exec stryker --version',
    configShape: [
      'stryker config file',
      'mutate globs narrowed to changed production files',
      'testRunner set to vitest or jest',
    ],
  };
}

function detectPython(repoPath, options) {
  const pyproject = safeRead(join(repoPath, 'pyproject.toml'));
  const setupCfg = safeRead(join(repoPath, 'setup.cfg'));
  const requirements = safeRead(join(repoPath, 'requirements.txt'));
  const combined = `${pyproject}\n${setupCfg}\n${requirements}`;
  const preferCosmicRay = /cosmic-ray/i.test(combined) && !/mutmut/i.test(combined);
  const selectedTool = preferCosmicRay ? 'cosmic-ray' : 'mutmut';
  const installed =
    /mutmut|cosmic-ray/i.test(combined) ||
    commandAvailable(selectedTool, ['--version'], repoPath, options);
  const configured = /\[tool\.mutmut\]|\[mutmut\]|\[tool\.cosmic-ray\]/i.test(combined);

  return {
    platform: 'python',
    selectedTool,
    installed,
    configured,
    installCommand: selectedTool === 'mutmut' ? 'pip install mutmut' : 'pip install cosmic-ray',
    verifyCommand: `${selectedTool} --version`,
    configShape: [
      'target module or package',
      'pytest command for relevant tests',
      'minimal tool configuration in pyproject.toml or setup.cfg',
    ],
  };
}

function detectJava(repoPath, options) {
  const pom = safeRead(join(repoPath, 'pom.xml'));
  const gradle = `${safeRead(join(repoPath, 'build.gradle'))}\n${safeRead(join(repoPath, 'build.gradle.kts'))}`;
  const combined = `${pom}\n${gradle}`;
  const installed =
    /pitest|info\.solidsoft\.pitest/i.test(combined) ||
    commandAvailable('mvn', ['-q', '-version'], repoPath, options) ||
    commandAvailable('gradle', ['-version'], repoPath, options);
  const configured = /targetClasses|targetTests|pitest/i.test(combined);
  const installCommand = existsSync(join(repoPath, 'pom.xml'))
    ? 'Add the PIT Maven plugin to pom.xml'
    : 'Add the PIT Gradle plugin to build.gradle(.kts)';

  return {
    platform: 'java',
    selectedTool: 'PIT',
    installed,
    configured,
    installCommand,
    verifyCommand: existsSync(join(repoPath, 'pom.xml'))
      ? 'mvn -q -DskipTests pitest:mutationCoverage'
      : 'gradle pitest',
    configShape: ['targetClasses glob', 'targetTests glob', 'minimal plugin configuration'],
  };
}

function detectCSharp(repoPath, options) {
  const dotnetManifest = safeRead(join(repoPath, DOTNET_TOOL_MANIFEST));
  const csprojContent = findFilesByExtension(repoPath, '.csproj')
    .map((filePath) => safeRead(filePath))
    .join('\n');
  const combined = `${dotnetManifest}\n${csprojContent}`;
  const installed =
    /dotnet-stryker|Stryker/i.test(combined) ||
    commandAvailable('dotnet', ['tool', 'list', '--local'], repoPath, options);
  const configured = /stryker/i.test(combined);

  return {
    platform: 'csharp',
    selectedTool: 'Stryker.NET',
    installed,
    configured,
    installCommand: 'dotnet new tool-manifest && dotnet tool install dotnet-stryker',
    verifyCommand: 'dotnet stryker --version',
    configShape: [
      'test project selection',
      'mutation scope filters',
      'minimal stryker-config if needed',
    ],
  };
}

function detectGo(repoPath, options) {
  const goMod = safeRead(join(repoPath, 'go.mod'));
  const installed =
    /go-mutesting/i.test(goMod) || commandAvailable('go-mutesting', ['--help'], repoPath, options);

  return {
    platform: 'go',
    selectedTool: 'go-mutesting',
    installed,
    configured: existsSync(join(repoPath, 'go.mod')),
    installCommand: 'go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest',
    verifyCommand: 'go-mutesting --help',
    configShape: ['target package path', 'go test command wrapper for the focused package'],
  };
}

function detectRust(repoPath, options) {
  const cargoToml = safeRead(join(repoPath, 'Cargo.toml'));
  const installed =
    /cargo-mutants/i.test(cargoToml) ||
    commandAvailable('cargo', ['mutants', '--version'], repoPath, options);

  return {
    platform: 'rust',
    selectedTool: 'cargo-mutants',
    installed,
    configured: existsSync(join(repoPath, 'Cargo.toml')),
    installCommand: 'cargo install cargo-mutants',
    verifyCommand: 'cargo mutants --version',
    configShape: ['crate or package selection', 'file/function filters', 'test selection args'],
  };
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

export function assessMutationReadiness(repoPath = '.', options = {}) {
  const resolvedRepoPath = resolve(repoPath);
  const platform = detectPlatform(resolvedRepoPath);

  let detection;
  switch (platform) {
    case 'javascript':
      detection = detectJavascript(resolvedRepoPath, options);
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
        selectedTool: null,
        installed: false,
        configured: false,
        installCommand: null,
        verifyCommand: null,
        configShape: [],
      };
  }

  const readiness = detection.installed
    ? detection.configured
      ? 'installed and configured'
      : 'installed-needs-config'
    : 'missing-tool';

  return {
    repoPath: resolvedRepoPath,
    platform: detection.platform,
    tool: detection.selectedTool,
    readiness,
    installed: detection.installed,
    configured: detection.configured,
    installCommand: detection.installCommand,
    verifyCommand: detection.verifyCommand,
    configShape: detection.configShape,
  };
}

function main() {
  const repoPath = process.argv[2] ?? '.';
  const result = assessMutationReadiness(repoPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (basename(process.argv[1] ?? '') === 'mutation-readiness.mjs') {
  main();
}
