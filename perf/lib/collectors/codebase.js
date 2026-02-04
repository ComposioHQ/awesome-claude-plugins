/**
 * Codebase Collector
 *
 * Scans codebase structure, frameworks, and implemented features.
 * Extracted from drift-detect/collectors.js for shared use.
 *
 * @module lib/collectors/codebase
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_OPTIONS = {
  depth: 'thorough',
  cwd: process.cwd()
};

/**
 * Directories to exclude from analysis
 */
const EXCLUDE_DIRS = [
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  '.git', '.svn', '.hg', '__pycache__', '.pytest_cache',
  'coverage', '.nyc_output', '.next', '.nuxt', '.cache'
];

/**
 * Source file extensions per language
 */
const SOURCE_EXTENSIONS = {
  js: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  rust: ['.rs'],
  go: ['.go'],
  python: ['.py'],
  java: ['.java']
};

/**
 * Safe file read
 */
function safeReadFile(filePath, basePath) {
  const fullPath = path.resolve(basePath, filePath);
  const resolvedBase = path.resolve(basePath);
  if (!fullPath.startsWith(resolvedBase)) {
    return null;
  }
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Check if path should be excluded
 */
function shouldExclude(filePath, excludeDirs = EXCLUDE_DIRS) {
  const parts = filePath.split(/[\\/]/);
  return parts.some(part => excludeDirs.includes(part));
}

/**
 * Detect frameworks from package.json
 */
function detectFrameworks(result, pkgJson) {
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const frameworkMap = {
    react: 'React',
    'react-dom': 'React',
    next: 'Next.js',
    vue: 'Vue.js',
    nuxt: 'Nuxt',
    angular: 'Angular',
    express: 'Express',
    fastify: 'Fastify',
    koa: 'Koa',
    nestjs: 'NestJS'
  };

  for (const [pkgName, framework] of Object.entries(frameworkMap)) {
    if (deps[pkgName]) {
      result.frameworks.push(framework);
    }
  }

  result.frameworks = [...new Set(result.frameworks)];
}

/**
 * Detect test framework
 */
function detectTestFramework(result, pkgJson) {
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const testFrameworks = ['jest', 'mocha', 'vitest', 'ava', 'tap', 'jasmine'];

  for (const framework of testFrameworks) {
    if (deps[framework]) {
      result.testFramework = framework;
      result.health.hasTests = true;
      break;
    }
  }
}

/**
 * Extract symbols (functions, classes, exports) from a JS/TS file
 */
function extractSymbols(content) {
  const symbols = {
    functions: [],
    classes: [],
    exports: []
  };

  const funcPattern = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    symbols.functions.push(match[1]);
  }

  const arrowPattern = /(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
  while ((match = arrowPattern.exec(content)) !== null) {
    symbols.functions.push(match[1]);
  }

  const classPattern = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = classPattern.exec(content)) !== null) {
    symbols.classes.push(match[1]);
  }

  const namedExportPattern = /export\s+(?:(?:async\s+)?function|class|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = namedExportPattern.exec(content)) !== null) {
    symbols.exports.push(match[1]);
  }

  const moduleExportsPattern = /module\.exports\s*=\s*\{([^}]+)\}/;
  const moduleMatch = content.match(moduleExportsPattern);
  if (moduleMatch) {
    const keys = moduleMatch[1].split(',').map(k => k.trim().split(':')[0].trim());
    symbols.exports.push(...keys.filter(k => k && /^[a-zA-Z_$]/.test(k)));
  }

  symbols.functions = [...new Set(symbols.functions)];
  symbols.classes = [...new Set(symbols.classes)];
  symbols.exports = [...new Set(symbols.exports)];

  return symbols;
}

/**
 * Scan key source files for symbols
 */
function scanFileSymbols(basePath, topLevelDirs) {
  const sourceSymbols = {};
  const sourceDirs = ['lib', 'src', 'app', 'pages', 'components', 'utils', 'services', 'api'];
  const dirsToScan = topLevelDirs.filter(d => sourceDirs.includes(d));
  const allExts = Object.values(SOURCE_EXTENSIONS).flat();

  let filesScanned = 0;
  const maxFiles = 40;

  function scanDir(dirPath, relativePath, depth = 0) {
    if (filesScanned >= maxFiles || depth > 2) return;
    if (!fs.existsSync(dirPath)) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (filesScanned >= maxFiles) break;

        const fullPath = path.join(dirPath, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          if (['node_modules', '__tests__', 'test', 'tests', 'dist', 'build'].includes(entry.name)) continue;
          scanDir(fullPath, relPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (!allExts.includes(ext)) continue;
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;

          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 50000) continue;

            const content = fs.readFileSync(fullPath, 'utf8');
            const symbols = extractSymbols(content);

            if (symbols.functions.length || symbols.classes.length || symbols.exports.length) {
              sourceSymbols[relPath] = symbols;
              filesScanned++;
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }

  for (const dir of dirsToScan) {
    if (filesScanned >= maxFiles) break;
    scanDir(path.join(basePath, dir), dir);
  }

  return sourceSymbols;
}

/**
 * Scan directory structure recursively
 */
function scanDirectory(result, basePath, relativePath, maxDepth, depth = 0) {
  if (depth >= maxDepth) return;

  const fullPath = path.join(basePath, relativePath);
  if (!fs.existsSync(fullPath)) return;

  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(entry.name)) {
          dirs.push(entry.name);
        }
      } else {
        files.push(entry.name);
      }
    }

    const key = relativePath || '.';
    result.structure[key] = { dirs, fileCount: files.length };

    for (const file of files) {
      const ext = path.extname(file).toLowerCase() || 'no-ext';
      result.fileStats[ext] = (result.fileStats[ext] || 0) + 1;
    }

    for (const dir of dirs) {
      scanDirectory(result, basePath, path.join(relativePath, dir), maxDepth, depth + 1);
    }
  } catch {
    // Permission or read errors
  }
}

/**
 * Detect project health indicators
 */
function detectHealth(result, basePath) {
  result.health.hasReadme = fs.existsSync(path.join(basePath, 'README.md'));

  const lintConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js', 'biome.json'];
  result.health.hasLinting = lintConfigs.some(f => fs.existsSync(path.join(basePath, f)));

  const ciConfigs = [
    '.github/workflows',
    '.gitlab-ci.yml',
    '.circleci',
    'Jenkinsfile',
    '.travis.yml'
  ];
  result.health.hasCi = ciConfigs.some(f => fs.existsSync(path.join(basePath, f)));

  const testDirs = ['tests', '__tests__', 'test', 'spec'];
  result.health.hasTests = result.health.hasTests || testDirs.some(d => fs.existsSync(path.join(basePath, d)));
}

/**
 * Find implemented features from code patterns
 */
function findImplementedFeatures(result, basePath) {
  const featurePatterns = {
    authentication: ['auth', 'login', 'session', 'jwt', 'oauth'],
    api: ['routes', 'controllers', 'handlers', 'endpoints'],
    database: ['models', 'schemas', 'migrations', 'seeds'],
    ui: ['components', 'views', 'pages', 'layouts'],
    testing: ['__tests__', 'test', 'spec', '.test.', '.spec.'],
    docs: ['docs', 'documentation', 'wiki']
  };

  for (const [feature, patterns] of Object.entries(featurePatterns)) {
    const found = patterns.some(pattern => {
      for (const dir of Object.keys(result.structure)) {
        if (dir.toLowerCase().includes(pattern)) {
          return true;
        }
      }
      return false;
    });

    if (found) {
      result.implementedFeatures.push(feature);
    }
  }
}

/**
 * Scan codebase structure and features
 * @param {Object} options - Collection options
 * @returns {Object} Codebase analysis
 */
function scanCodebase(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;

  const result = {
    summary: { totalDirs: 0, totalFiles: 0 },
    topLevelDirs: [],
    frameworks: [],
    testFramework: null,
    hasTypeScript: false,
    implementedFeatures: [],
    symbols: {},
    health: {
      hasTests: false,
      hasLinting: false,
      hasCi: false,
      hasReadme: false
    },
    fileStats: {}
  };

  const internalStructure = {};

  // Detect package.json dependencies
  const pkgContent = safeReadFile('package.json', basePath);
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      detectFrameworks(result, pkg);
      detectTestFramework(result, pkg);
    } catch {
      // Invalid JSON
    }
  }

  result.hasTypeScript = fs.existsSync(path.join(basePath, 'tsconfig.json'));

  scanDirectory({ structure: internalStructure, fileStats: result.fileStats }, basePath, '', opts.depth === 'thorough' ? 3 : 2);

  result.summary.totalDirs = Object.keys(internalStructure).length;
  result.summary.totalFiles = Object.values(internalStructure).reduce((sum, d) => sum + (d.fileCount || 0), 0);

  const rootEntry = internalStructure['.'];
  if (rootEntry) {
    result.topLevelDirs = rootEntry.dirs || [];
  }

  detectHealth(result, basePath);

  if (opts.depth === 'thorough') {
    findImplementedFeatures({ ...result, structure: internalStructure }, basePath);
    result.symbols = scanFileSymbols(basePath, result.topLevelDirs);
  }

  const sortedStats = Object.entries(result.fileStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  result.fileStats = Object.fromEntries(sortedStats);

  return result;
}

module.exports = {
  DEFAULT_OPTIONS,
  EXCLUDE_DIRS,
  SOURCE_EXTENSIONS,
  scanCodebase,
  detectFrameworks,
  detectTestFramework,
  detectHealth,
  findImplementedFeatures,
  extractSymbols,
  scanFileSymbols,
  scanDirectory,
  shouldExclude,
  safeReadFile
};
