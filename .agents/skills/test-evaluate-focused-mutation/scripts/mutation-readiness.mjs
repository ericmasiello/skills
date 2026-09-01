import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  try {
    return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

/**
 * Parse JSON that may be absent or malformed.
 *
 * A trailing comma in a target repository's package.json must not crash a
 * read-only audit; it degrades to "no declarations found" plus a warning.
 */
function safeParseJson(raw, warnings, label) {
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    warnings.push(`${label} is present but not valid JSON (${error.message}); declarations were not read.`);
    return {};
  }
}

/**
 * Strip comments before matching a declaration.
 *
 * A commented-out mention is not a declaration. Matching raw manifest text made
 * `<!-- TODO: someday add pitest -->` report the tool as installed.
 */
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
    // withFileTypes avoids a per-entry statSync, which throws ENOENT on a
    // dangling symlink and would abort the whole readiness assessment.
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

/**
 * Detect EVERY platform present, not just the first match.
 *
 * First-match-wins with package.json checked first classified every module of a
 * polyglot repository as `javascript`, silently, with no ambiguity signal.
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

function detectJavascript(repoPath, options = {}, warnings = []) {
  const packageJsonPath = join(repoPath, 'package.json');
  const packageJson = safeParseJson(safeRead(packageJsonPath), warnings, 'package.json');
  const packageManager = existsSync(join(repoPath, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : existsSync(join(repoPath, 'yarn.lock'))
      ? 'yarn'
      : 'npm';
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const runner = deps.jest && !deps.vitest ? 'jest' : 'vitest';
  const runnerPackage = `@stryker-mutator/${runner}-runner`;
  const hasRunner = Boolean(deps[runnerPackage]);
  const declared = Boolean(deps['@stryker-mutator/core']) && hasRunner;
  const probeArgs = packageManager === 'yarn'
    ? ['stryker', '--version']
    : packageManager === 'pnpm'
      ? ['exec', 'stryker', '--version']
      : ['exec', '--', 'stryker', '--version'];
  const installed = declared && commandAvailable(packageManager, probeArgs, repoPath, options);
  const configured =
    JS_CONFIG_FILES.some((fileName) => existsSync(join(repoPath, fileName))) ||
    Boolean(packageJson.stryker);

  return {
    platform: 'javascript',
    selectedTool: 'Stryker',
    declared,
    installed,
    configured,
    installCommand: `${packageManager} ${packageManager === 'npm' ? 'install -D' : 'add -D'} @stryker-mutator/core ${runnerPackage}`,
    verifyCommand: packageManager === 'yarn' ? 'yarn stryker --version' : `${packageManager} exec -- stryker --version`,
    configShape: [
      'stryker config file',
      'mutate globs narrowed to changed production files',
      `testRunner set to ${runner}`,
    ],
  };
}

function detectPython(repoPath, options) {
  const pyproject = safeRead(join(repoPath, 'pyproject.toml'));
  const setupCfg = safeRead(join(repoPath, 'setup.cfg'));
  const requirements = safeRead(join(repoPath, 'requirements.txt'));
  const combined = withoutComments(`${pyproject}\n${setupCfg}\n${requirements}`, 'hash');
  const preferCosmicRay = /cosmic-ray/i.test(combined) && !/mutmut/i.test(combined);
  const selectedTool = preferCosmicRay ? 'cosmic-ray' : 'mutmut';
  // A manifest mention is a DECLARATION. Only an executed probe proves it runs.
  const declared = /mutmut|cosmic-ray/i.test(combined);
  const installed = declared && commandAvailable(selectedTool, ['--version'], repoPath, options);
  const configured = /\[tool\.mutmut\]|\[mutmut\]|\[tool\.cosmic-ray\]/i.test(combined);

  return {
    platform: 'python',
    selectedTool,
    declared,
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
  const pom = withoutComments(safeRead(join(repoPath, 'pom.xml')), 'xml');
  const gradle = withoutComments(
    `${safeRead(join(repoPath, 'build.gradle'))}\n${safeRead(join(repoPath, 'build.gradle.kts'))}`,
    'slash',
  );
  const combined = `${pom}\n${gradle}`;
  // Previously text-only: an XML comment mentioning pitest reported "installed".
  const declared = /pitest|info\.solidsoft\.pitest/i.test(combined);
  const hasMaven = existsSync(join(repoPath, 'pom.xml'));
  const installed =
    declared &&
    (hasMaven
      ? commandAvailable('mvn', ['-q', '-version'], repoPath, options)
      : commandAvailable('gradle', ['-version'], repoPath, options));
  const configured = /targetClasses|targetTests/i.test(combined);
  const installCommand = existsSync(join(repoPath, 'pom.xml'))
    ? 'Add the PIT Maven plugin to pom.xml'
    : 'Add the PIT Gradle plugin to build.gradle(.kts)';

  return {
    platform: 'java',
    selectedTool: 'PIT',
    declared,
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
    .map((filePath) => withoutComments(safeRead(filePath), 'xml'))
    .join('\n');
  const combined = `${dotnetManifest}\n${csprojContent}`;
  const declared = /dotnet-stryker/i.test(combined);
  const installed = declared && commandAvailable('dotnet', ['tool', 'run', 'dotnet-stryker', '--version'], repoPath, options);
  const configured = /stryker/i.test(combined);

  return {
    platform: 'csharp',
    selectedTool: 'Stryker.NET',
    declared,
    installed,
    configured,
    installCommand: 'dotnet new tool-manifest && dotnet tool install dotnet-stryker',
    verifyCommand: 'dotnet tool run dotnet-stryker --version',
    configShape: [
      'test project selection',
      'mutation scope filters',
      'minimal stryker-config if needed',
    ],
  };
}

function detectGo(repoPath, options) {
  const goMod = withoutComments(safeRead(join(repoPath, 'go.mod')), 'slash');
  const declared = /go-mutesting/i.test(goMod);
  const installed = commandAvailable('go-mutesting', ['--help'], repoPath, options);

  return {
    platform: 'go',
    selectedTool: 'go-mutesting',
    declared,
    installed,
    // go.mod presence was already required to reach this branch, so it proved
    // nothing about mutation configuration.
    configured: declared,
    installCommand: 'go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest',
    verifyCommand: 'go-mutesting --help',
    configShape: ['target package path', 'go test command wrapper for the focused package'],
  };
}

function detectRust(repoPath, options) {
  const cargoToml = withoutComments(safeRead(join(repoPath, 'Cargo.toml')), 'hash');
  const declared = /cargo-mutants/i.test(cargoToml);
  const installed = commandAvailable('cargo', ['mutants', '--version'], repoPath, options);

  return {
    platform: 'rust',
    selectedTool: 'cargo-mutants',
    declared,
    installed,
    configured: declared,
    installCommand: 'cargo install cargo-mutants',
    verifyCommand: 'cargo mutants --version',
    configShape: ['crate or package selection', 'file/function filters', 'test selection args'],
  };
}

function detectC(repoPath, options) {
  const cmake = withoutComments(safeRead(join(repoPath, 'CMakeLists.txt')), 'hash');
  const installed = commandAvailable('mull-cxx', ['--version'], repoPath, options);
  return {
    platform: 'c',
    selectedTool: 'Mull',
    declared: /mull|clang/i.test(cmake),
    installed,
    configured: /mull|clang/i.test(cmake),
    installCommand: 'Install Mull and build the target with a supported Clang toolchain',
    verifyCommand: 'mull-cxx --version',
    configShape: ['Clang build command', 'target binary or compile database', 'focused mutation filter'],
  };
}

function commandAvailable(command, args, cwd, options = {}) {
  if (options.checkCommands === false) {
    return false;
  }

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'ignore',
    // A probe must never hang the audit. mvn, gradle and dotnet can all block
    // on a first-run restore.
    timeout: options.probeTimeoutMs ?? 10_000,
    killSignal: 'SIGKILL',
  });

  // result.error covers ENOENT, EACCES and timeout; status alone would read
  // "absent" as the same thing as "failed".
  return !result.error && result.status === 0;
}

export function assessMutationReadiness(repoPath = '.', options = {}) {
  const resolvedRepoPath = resolve(repoPath);
  const warnings = [];

  if (!existsSync(resolvedRepoPath)) {
    return {
      repoPath: resolvedRepoPath,
      platform: 'unknown',
      platforms: [],
      tool: null,
      readiness: 'target-not-found',
      declared: false,
      probed: false,
      installed: false,
      configured: false,
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
        selectedTool: null,
        declared: false,
        installed: false,
        configured: false,
        installCommand: null,
        verifyCommand: null,
        configShape: [],
      };
  }

  const probed = options.checkCommands !== false;

  // `declared-unverified` is the honest verdict when a manifest declares the
  // tool but no probe was run. Reporting it as installed is how a comment in a
  // pom.xml became "installed and configured".
  let readiness;
  if (detection.installed) {
    readiness = detection.configured ? 'installed and configured' : 'installed-needs-config';
  } else if (detection.declared && !probed) {
    readiness = 'declared-unverified';
  } else {
    readiness = 'missing-tool';
  }

  if (detection.declared && probed && !detection.installed) {
    warnings.push(
      `${detection.selectedTool ?? 'The tool'} is declared in the manifest but its verify command did not succeed. Treat mutation evidence as unavailable until "${detection.verifyCommand}" runs cleanly.`,
    );
  }

  return {
    repoPath: resolvedRepoPath,
    platform: detection.platform,
    platforms,
    tool: detection.selectedTool,
    readiness,
    declared: Boolean(detection.declared),
    probed,
    installed: detection.installed,
    configured: detection.configured,
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
    const result = assessMutationReadiness(repoPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.readiness === 'target-not-found') {
      process.exitCode = EXIT_CODES.TARGET_NOT_FOUND;
      return;
    }
    // A negative verdict must not exit 0, or `&&` chains and CI steps proceed
    // as though mutation evidence were obtainable.
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
