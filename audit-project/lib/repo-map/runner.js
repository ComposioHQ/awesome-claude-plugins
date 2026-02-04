/**
 * ast-grep execution and result parsing
 * 
 * @module lib/repo-map/runner
 */

'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');

const installer = require('./installer');
const queries = require('./queries');
const slopAnalyzers = require('../patterns/slop-analyzers');

// Language file extensions mapping
const LANGUAGE_EXTENSIONS = {
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  typescript: ['.ts', '.tsx', '.mts', '.cts'],
  python: ['.py', '.pyw'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java']
};

// Directories to exclude from scanning (extend base list)
const EXCLUDE_DIRS = Array.from(new Set([
  ...slopAnalyzers.EXCLUDE_DIRS,
  '.claude', '.opencode', '.codex', '.venv', 'venv', 'env'
]));

const AST_GREP_BATCH_SIZE = 100;
const LANGUAGE_EXTENSION_SCAN_LIMIT = 500;
const FILE_READ_BATCH_SIZE = 50; // Concurrent file reads

/**
 * Detect languages in a repository
 * @param {string} basePath - Repository root
 * @returns {Promise<string[]>} - List of detected languages
 */
async function detectLanguages(basePath) {
  const detected = new Set();
  
  // Check for config files first (faster)
  const configIndicators = {
    javascript: ['package.json', 'jsconfig.json'],
    typescript: ['tsconfig.json', 'tsconfig.base.json'],
    python: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    rust: ['Cargo.toml'],
    go: ['go.mod', 'go.sum'],
    java: ['pom.xml', 'build.gradle', 'build.gradle.kts']
  };
  
  for (const [lang, files] of Object.entries(configIndicators)) {
    for (const file of files) {
      if (fs.existsSync(path.join(basePath, file))) {
        detected.add(lang);
        break;
      }
    }
  }
  
  // Supplement with extension scan to catch mixed-language repos
  const extensions = scanForExtensions(basePath, LANGUAGE_EXTENSION_SCAN_LIMIT);
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.some(ext => extensions.has(ext))) {
      detected.add(lang);
    }
  }
  
  return Array.from(detected);
}

/**
 * Scan repository for file extensions (sampling)
 * @param {string} basePath - Repository root
 * @param {number} maxFiles - Maximum files to check
 * @returns {Set<string>} - Set of extensions found
 */
function scanForExtensions(basePath, maxFiles = 100) {
  const extensions = new Set();
  let count = 0;
  const isIgnored = slopAnalyzers.parseGitignore(basePath, fs, path);
  
  function scan(dir) {
    if (count >= maxFiles) return;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (count >= maxFiles) break;
        
        if (entry.isDirectory()) {
          const relativePath = path.relative(basePath, path.join(dir, entry.name));
          if (slopAnalyzers.shouldExclude(relativePath, EXCLUDE_DIRS)) continue;
          if (isIgnored && isIgnored(relativePath, true)) continue;
          if (!entry.name.startsWith('.')) {
            scan(path.join(dir, entry.name));
          }
        } else if (entry.isFile()) {
          const relativePath = path.relative(basePath, path.join(dir, entry.name));
          if (slopAnalyzers.shouldExclude(relativePath, EXCLUDE_DIRS)) continue;
          if (isIgnored && isIgnored(relativePath, false)) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) {
            extensions.add(ext);
            count++;
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
  
  scan(basePath);
  return extensions;
}

/**
 * Run a full scan of the repository
 * @param {string} basePath - Repository root
 * @param {string[]} languages - Languages to scan
 * @returns {Promise<Object>} - The generated map
 */
async function fullScan(basePath, languages, options = {}) {
  const cmd = installer.getCommand();
  if (!cmd) {
    throw new Error('ast-grep not found');
  }
  const fileLimit = Number.isFinite(options.fileLimit) ? Math.max(0, Math.floor(options.fileLimit)) : null;
  const filesByLanguage = collectFilesByLanguage(basePath, languages, {
    maxFiles: fileLimit
  });
  
  const map = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    updated: null,
    git: getGitInfo(basePath),
    project: {
      type: detectProjectType(languages),
      languages,
      frameworks: [] // Could be enhanced later
    },
    stats: {
      totalFiles: 0,
      totalSymbols: 0,
      scanDurationMs: 0,
      errors: []
    },
    files: {},
    dependencies: {}
  };
  
  // Run queries for each language
  for (const lang of languages) {
    const langQueries = queries.getQueriesForLanguage(lang);
    if (!langQueries) continue;

    const files = filesByLanguage.get(lang) || [];
    if (files.length === 0) continue;

    const fileEntries = [];
    const symbolMapsByFile = new Map();
    const importStateByFile = new Map();
    const contentByFile = new Map();

    // Filter out already processed files first
    const filesToProcess = files.filter(file => {
      const relativePath = path.relative(basePath, file).replace(/\\/g, '/');
      return !map.files[relativePath];
    });

    // Batch read all files asynchronously
    const fileContents = await batchReadFiles(filesToProcess);

    for (const file of filesToProcess) {
      const relativePath = path.relative(basePath, file).replace(/\\/g, '/');
      const readResult = fileContents.get(file);

      if (readResult.error || readResult.content === null) {
        map.stats.errors.push({
          file: relativePath,
          error: readResult.error?.message || 'Failed to read file'
        });
        continue;
      }

      const content = readResult.content;
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

      map.files[relativePath] = {
        hash,
        language: lang,
        size: content.length,
        symbols: {
          exports: [],
          functions: [],
          classes: [],
          types: [],
          constants: []
        },
        imports: []
      };

      map.stats.totalFiles++;
      fileEntries.push({ file, relativePath });
      symbolMapsByFile.set(relativePath, createSymbolMaps());
      importStateByFile.set(relativePath, { items: [], seen: new Set() });
      contentByFile.set(relativePath, content);
    }

    if (fileEntries.length === 0) continue;

    const filesBySgLang = new Map();
    for (const entry of fileEntries) {
      const sgLang = queries.getSgLanguageForFile(entry.file, lang);
      if (!filesBySgLang.has(sgLang)) {
        filesBySgLang.set(sgLang, []);
      }
      filesBySgLang.get(sgLang).push(entry);
    }

    for (const [sgLang, entries] of filesBySgLang) {
      const filePaths = entries.map(entry => entry.file);
      const experimentBatchSize = process.env.PERF_EXPERIMENT === '1'
        ? Number(process.env.REPO_MAP_AST_GREP_BATCH_SIZE)
        : null;
      const batchSize = Number.isFinite(options.astGrepBatchSize)
        ? Math.max(1, Math.floor(options.astGrepBatchSize))
        : Number.isFinite(experimentBatchSize) && experimentBatchSize > 0
          ? Math.max(1, Math.floor(experimentBatchSize))
          : AST_GREP_BATCH_SIZE;
      const chunks = chunkArray(filePaths, batchSize);

      const patternGroups = [
        { category: 'exports', patterns: langQueries.exports, defaultKind: 'export' },
        { category: 'functions', patterns: langQueries.functions, defaultKind: 'function' },
        { category: 'classes', patterns: langQueries.classes, defaultKind: 'class' },
        { category: 'types', patterns: langQueries.types, defaultKind: 'type' },
        { category: 'constants', patterns: langQueries.constants, defaultKind: 'constant' },
        { category: 'imports', patterns: langQueries.imports, defaultKind: 'import' }
      ];

      for (const group of patternGroups) {
        if (!group.patterns || group.patterns.length === 0) continue;

        for (const patternDef of group.patterns) {
          const pattern = typeof patternDef === 'string' ? patternDef : patternDef.pattern;
          if (!pattern) continue;

          for (const chunk of chunks) {
            const matches = runAstGrepPattern(cmd, pattern, sgLang, basePath, chunk);
            for (const match of matches) {
              const matchedPath = normalizeMatchPath(match.file, basePath);
              if (!matchedPath) continue;

              const symbolMaps = symbolMapsByFile.get(matchedPath);
              const importState = importStateByFile.get(matchedPath);
              if (!symbolMaps || !importState) continue;

              if (group.category === 'imports') {
                const sourceResult = extractSourceFromMatch(match, patternDef);
                const sources = Array.isArray(sourceResult) ? sourceResult : [sourceResult];
                for (const source of sources) {
                  if (!source) continue;
                  const kind = patternDef.kind || 'import';
                  const key = `${source}:${kind}`;
                  if (importState.seen.has(key)) continue;
                  importState.seen.add(key);
                  importState.items.push({
                    source,
                    kind,
                    line: getLine(match)
                  });
                }
                continue;
              }

              const names = extractNamesFromMatch(match, patternDef);
              const targetMap = symbolMaps[group.category];
              if (!targetMap) continue;
              for (const name of names) {
                const kind = patternDef.kind || group.defaultKind;
                addSymbolToMap(targetMap, name, match, kind, patternDef.extra);
              }
            }
          }
        }
      }
    }

    for (const entry of fileEntries) {
      const relativePath = entry.relativePath;
      const symbolMaps = symbolMapsByFile.get(relativePath);
      const importState = importStateByFile.get(relativePath);
      if (!symbolMaps || !importState) continue;

      const exportNames = new Set(symbolMaps.exports.keys());
      const content = contentByFile.get(relativePath) || '';
      applyLanguageExportRules(lang, content, exportNames, symbolMaps.functions, symbolMaps.classes, symbolMaps.types, symbolMaps.constants);
      ensureExportEntries(symbolMaps.exports, exportNames, symbolMaps.functions, symbolMaps.classes, symbolMaps.types, symbolMaps.constants);

      const symbols = {
        exports: mapToSortedArray(symbolMaps.exports),
        functions: mapToSortedArray(symbolMaps.functions, exportNames),
        classes: mapToSortedArray(symbolMaps.classes, exportNames),
        types: mapToSortedArray(symbolMaps.types, exportNames),
        constants: mapToSortedArray(symbolMaps.constants, exportNames)
      };

      map.files[relativePath].symbols = symbols;
      map.files[relativePath].imports = importState.items;

      if (importState.items.length > 0) {
        map.dependencies[relativePath] = Array.from(new Set(importState.items.map(imp => imp.source)));
      }

      map.stats.totalSymbols +=
        (symbols.functions?.length || 0) +
        (symbols.classes?.length || 0) +
        (symbols.types?.length || 0) +
        (symbols.constants?.length || 0);
    }
  }

  return map;
}

/**
 * Find all files for a language
 * @param {string} basePath - Repository root
 * @param {string} language - Language name
 * @returns {string[]} - Array of file paths
 */
function findFilesForLanguage(basePath, language, options = {}) {
  const extensions = LANGUAGE_EXTENSIONS[language] || [];
  const files = [];
  const isIgnored = slopAnalyzers.parseGitignore(basePath, fs, path);
  const maxFiles = Number.isFinite(options.maxFiles) ? Math.max(0, Math.floor(options.maxFiles)) : null;
  
  function scan(dir) {
    if (maxFiles !== null && files.length >= maxFiles) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (maxFiles !== null && files.length >= maxFiles) break;
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const relativePath = path.relative(basePath, fullPath);
          if (slopAnalyzers.shouldExclude(relativePath, EXCLUDE_DIRS)) continue;
          if (isIgnored && isIgnored(relativePath, true)) continue;
          if (!entry.name.startsWith('.')) {
            scan(fullPath);
          }
        } else if (entry.isFile()) {
          const relativePath = path.relative(basePath, fullPath);
          if (slopAnalyzers.shouldExclude(relativePath, EXCLUDE_DIRS)) continue;
          if (isIgnored && isIgnored(relativePath, false)) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
            if (maxFiles !== null && files.length >= maxFiles) break;
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
  
  scan(basePath);
  return files;
}

/**
 * Collect files for all languages in a single walk.
 * @param {string} basePath - Repository root
 * @param {string[]} languages - Languages to collect
 * @param {Object} options
 * @param {number} [options.maxFiles] - Global file limit
 * @returns {Map<string, string[]>} - Map of language -> file paths
 */
function collectFilesByLanguage(basePath, languages, options = {}) {
  const langList = Array.isArray(languages) ? languages : [];
  const filesByLanguage = new Map();
  for (const lang of langList) {
    filesByLanguage.set(lang, []);
  }

  const extensionToLang = new Map();
  for (const lang of langList) {
    const extensions = LANGUAGE_EXTENSIONS[lang] || [];
    for (const ext of extensions) {
      if (!extensionToLang.has(ext)) {
        extensionToLang.set(ext, lang);
      }
    }
  }

  const isIgnored = slopAnalyzers.parseGitignore(basePath, fs, path);
  const maxFiles = Number.isFinite(options.maxFiles) ? Math.max(0, Math.floor(options.maxFiles)) : null;
  let count = 0;

  function scan(dir) {
    if (maxFiles !== null && count >= maxFiles) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (maxFiles !== null && count >= maxFiles) break;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const relativePath = path.relative(basePath, fullPath);
          if (slopAnalyzers.shouldExclude(relativePath, EXCLUDE_DIRS)) continue;
          if (isIgnored && isIgnored(relativePath, true)) continue;
          if (!entry.name.startsWith('.')) {
            scan(fullPath);
          }
        } else if (entry.isFile()) {
          const relativePath = path.relative(basePath, fullPath);
          if (slopAnalyzers.shouldExclude(relativePath, EXCLUDE_DIRS)) continue;
          if (isIgnored && isIgnored(relativePath, false)) continue;
          const ext = path.extname(entry.name).toLowerCase();
          const lang = extensionToLang.get(ext);
          if (lang) {
            const bucket = filesByLanguage.get(lang);
            if (bucket) {
              bucket.push(fullPath);
              count++;
            }
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  scan(basePath);
  return filesByLanguage;
}

function createSymbolMaps() {
  return {
    exports: new Map(),
    functions: new Map(),
    classes: new Map(),
    types: new Map(),
    constants: new Map()
  };
}

/**
 * Read multiple files asynchronously in batches
 * @param {string[]} files - Array of file paths
 * @param {number} batchSize - Concurrent reads per batch
 * @returns {Promise<Map<string, {content: string, error: Error|null}>>}
 */
async function batchReadFiles(files, batchSize = FILE_READ_BATCH_SIZE) {
  const results = new Map();

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await fsPromises.readFile(file, 'utf8');
          return { file, content, error: null };
        } catch (err) {
          return { file, content: null, error: err };
        }
      })
    );

    for (const result of batchResults) {
      results.set(result.file, { content: result.content, error: result.error });
    }
  }

  return results;
}

function chunkArray(items, size) {
  if (!items || items.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeMatchPath(matchFile, basePath) {
  if (!matchFile) return null;
  const absolutePath = path.isAbsolute(matchFile) ? matchFile : path.join(basePath, matchFile);
  return path.relative(basePath, absolutePath).replace(/\\/g, '/');
}

function addSymbolToMap(map, name, match, kind, extra = {}) {
  if (!name) return;
  if (!map.has(name)) {
    map.set(name, {
      name,
      line: getLine(match),
      kind,
      ...extra
    });
  }
}

function runAstGrepPattern(cmd, pattern, lang, basePath, filePaths) {
  if (!pattern || !filePaths || filePaths.length === 0) return [];

  try {
    const result = spawnSync(cmd, [
      'run',
      '--pattern', pattern,
      '--lang', lang,
      '--json=stream',
      ...filePaths
    ], {
      cwd: basePath,
      encoding: 'utf8',
      timeout: 300000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (result.error) {
      return [];
    }

    if (typeof result.status === 'number' && result.status > 1) {
      return [];
    }

    return parseNdjson(result.stdout);
  } catch {
    return [];
  }
}

/**
 * Extract symbols from a file using ast-grep
 * @param {string} cmd - ast-grep command
 * @param {string} file - File path
 * @param {string} language - Language name
 * @param {Object} langQueries - Query patterns for this language
 * @param {string} basePath - Repository root (for cwd)
 * @param {string} content - File content
 * @returns {Object} - Extracted symbols
 */
function extractSymbols(cmd, file, language, langQueries, basePath, content) {
  const symbols = {
    exports: [],
    functions: [],
    classes: [],
    types: [],
    constants: []
  };

  const sgLang = queries.getSgLanguageForFile(file, language);

  const exportMap = new Map();
  const functionMap = new Map();
  const classMap = new Map();
  const typeMap = new Map();
  const constMap = new Map();

  const addSymbol = (map, name, match, kind, extra = {}) => {
    if (!name) return;
    if (!map.has(name)) {
      map.set(name, {
        name,
        line: getLine(match),
        kind,
        ...extra
      });
    }
  };

  const runPatternSet = (patterns, targetMap, defaultKind) => {
    if (!patterns) return;
    for (const patternDef of patterns) {
      const pattern = patternDef.pattern || patternDef;
      const results = runAstGrep(cmd, file, pattern, sgLang, basePath);
      for (const match of results) {
        const names = extractNamesFromMatch(match, patternDef);
        for (const name of names) {
          const kind = patternDef.kind || defaultKind;
          addSymbol(targetMap, name, match, kind, patternDef.extra);
        }
      }
    }
  };

  // Extract exports
  runPatternSet(langQueries.exports, exportMap, 'export');

  // Extract functions
  runPatternSet(langQueries.functions, functionMap, 'function');

  // Extract classes
  runPatternSet(langQueries.classes, classMap, 'class');

  // Extract types
  runPatternSet(langQueries.types, typeMap, 'type');

  // Extract constants
  runPatternSet(langQueries.constants, constMap, 'constant');

  // Infer exports for languages with implicit public rules
  const exportNames = new Set(exportMap.keys());
  applyLanguageExportRules(language, content, exportNames, functionMap, classMap, typeMap, constMap);

  // Ensure export entries exist for inferred exports
  ensureExportEntries(exportMap, exportNames, functionMap, classMap, typeMap, constMap);

  // Convert maps to arrays and mark exported flags
  symbols.exports = mapToSortedArray(exportMap);
  symbols.functions = mapToSortedArray(functionMap, exportNames);
  symbols.classes = mapToSortedArray(classMap, exportNames);
  symbols.types = mapToSortedArray(typeMap, exportNames);
  symbols.constants = mapToSortedArray(constMap, exportNames);

  return symbols;
}

/**
 * Extract imports from a file using ast-grep
 * @param {string} cmd - ast-grep command
 * @param {string} file - File path
 * @param {string} language - Language name
 * @param {Object} langQueries - Query patterns for this language
 * @param {string} basePath - Repository root (for cwd)
 * @returns {Array} - Extracted imports
 */
function extractImports(cmd, file, language, langQueries, basePath) {
  const imports = [];

  if (!langQueries.imports) return imports;

  const sgLang = queries.getSgLanguageForFile(file, language);
  const seen = new Set();

  for (const patternDef of langQueries.imports) {
    const pattern = patternDef.pattern || patternDef;
    const results = runAstGrep(cmd, file, pattern, sgLang, basePath);
    for (const match of results) {
      const sourceResult = extractSourceFromMatch(match, patternDef);
      const sources = Array.isArray(sourceResult) ? sourceResult : [sourceResult];
      for (const source of sources) {
        if (!source) continue;
        const key = `${source}:${patternDef.kind || 'import'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        imports.push({
          source,
          kind: patternDef.kind || 'import',
          line: getLine(match)
        });
      }
    }
  }

  return imports;
}

/**
 * Run ast-grep with a pattern
 * @param {string} cmd - ast-grep command
 * @param {string} file - File to scan
 * @param {string} pattern - Pattern to match
 * @param {string} lang - ast-grep language identifier
 * @param {string} basePath - Working directory
 * @returns {Array} - Match results
 */
function runAstGrep(cmd, file, pattern, lang, basePath) {
  try {
    const result = spawnSync(cmd, [
      'run',
      '--pattern', pattern,
      '--lang', lang,
      '--json=stream',
      file
    ], {
      cwd: basePath,
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    if (result.error) {
      return [];
    }
    
    // ast-grep exits with 1 when no matches
    if (typeof result.status === 'number' && result.status > 1) {
      return [];
    }
    
    return parseNdjson(result.stdout);
  } catch {
    return [];
  }
}

function parseNdjson(output) {
  const matches = [];
  const lines = (output || '').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      matches.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return matches;
}

/**
 * Extract names from an ast-grep match, based on pattern metadata
 * @param {Object} match - ast-grep match result
 * @param {Object|string} patternDef - Pattern definition or string
 * @returns {string[]} - List of names
 */
function extractNamesFromMatch(match, patternDef) {
  const def = typeof patternDef === 'string' ? {} : (patternDef || {});

  if (def.multi === 'exportList') {
    return extractNamesFromExportList(match.text || '');
  }

  if (def.multi === 'objectLiteral') {
    return extractNamesFromObjectLiteral(match.text || '');
  }

  const name = extractNameFromMatch(match, def.nameVar);
  if (name) return [name];
  if (def.fallbackName) return [def.fallbackName];
  return [];
}

function getMetaVariable(match, key) {
  if (!match || !match.metaVariables) return null;
  if (match.metaVariables[key]) return match.metaVariables[key];
  if (match.metaVariables.single && match.metaVariables.single[key]) {
    return match.metaVariables.single[key];
  }
  return null;
}

/**
 * Extract a single name from ast-grep match
 * @param {Object} match - ast-grep match result
 * @param {string|string[]} nameVar - Preferred meta variable name(s)
 * @returns {string|null}
 */
function extractNameFromMatch(match, nameVar) {
  const vars = [];
  if (Array.isArray(nameVar)) {
    vars.push(...nameVar);
  } else if (nameVar) {
    vars.push(nameVar);
  }
  vars.push('NAME', 'FUNC', 'CLASS', 'IDENT', 'N');

  for (const key of vars) {
    const variable = getMetaVariable(match, key);
    if (variable && variable.text) {
      return variable.text;
    }
  }

  // Fallback: extract from matched text
  if (match.text) {
    const nameMatch = match.text.match(/(?:function|class|const|let|var|def|fn|pub\s+fn|type|struct|enum|trait|interface|record)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (nameMatch) {
      return nameMatch[1];
    }
  }

  return null;
}

/**
 * Extract import source from ast-grep match
 * @param {Object} match - ast-grep match result
 * @param {Object|string} patternDef - Pattern definition or string
 * @returns {string|null}
 */
function extractSourceFromMatch(match, patternDef) {
  const def = typeof patternDef === 'string' ? {} : (patternDef || {});
  const sourceVar = def.sourceVar || 'SOURCE';

  const variable = getMetaVariable(match, sourceVar);
  if (variable && variable.text) {
    const raw = variable.text.replace(/^['"]|['"]$/g, '');
    if (def.multiSource) {
      return splitMultiSource(raw);
    }
    return raw;
  }

  // Fallback: extract quoted string from match
  if (match.text) {
    const sourceMatch = match.text.match(/['"]([^'"]+)['"]/);
    if (sourceMatch) {
      return sourceMatch[1];
    }
  }

  return null;
}

/**
 * Extract export names from `export { ... }`
 * @param {string} text - Match text
 * @returns {string[]}
 */
function extractNamesFromExportList(text) {
  const match = text.match(/\{([^}]+)\}/);
  if (!match) return [];

  const names = new Set();
  const parts = match[1].split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const aliasMatch = trimmed.split(/\s+as\s+/i).map(s => s.trim());
    const name = (aliasMatch[1] || aliasMatch[0]).replace(/[^a-zA-Z0-9_\$]/g, '');
    if (isValidIdentifier(name)) names.add(name);
  }

  return Array.from(names);
}

/**
 * Extract property names from object literal
 * @param {string} text - Match text
 * @returns {string[]}
 */
function extractNamesFromObjectLiteral(text) {
  const match = text.match(/\{([\s\S]*?)\}/);
  if (!match) return [];

  const body = match[1];
  const names = new Set();

  // Match shorthand properties and key: value pairs
  const propRegex = /\b([A-Za-z_$][\w$]*)\b\s*(?=,|\}|:)/g;
  let propMatch;
  while ((propMatch = propRegex.exec(body)) !== null) {
    const name = propMatch[1];
    if (isValidIdentifier(name)) names.add(name);
  }

  return Array.from(names);
}

/**
 * Split comma-separated import sources
 * @param {string} raw - Raw source text
 * @returns {string[]}
 */
function splitMultiSource(raw) {
  if (!raw) return [];
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  const results = [];
  for (const part of parts) {
    const [name] = part.split(/\s+as\s+/i);
    const cleaned = name.trim().replace(/^['"]|['"]$/g, '');
    if (cleaned) results.push(cleaned);
  }
  return results;
}

/**
 * Determine if a name is a valid identifier
 * @param {string} name - Name to check
 * @returns {boolean}
 */
function isValidIdentifier(name) {
  return Boolean(name) && /^[A-Za-z_$][\w$]*$/.test(name);
}

/**
 * Get 1-based line number from ast-grep match
 * @param {Object} match - ast-grep match
 * @returns {number|null}
 */
function getLine(match) {
  const line = match?.range?.start?.line;
  return typeof line === 'number' ? line + 1 : null;
}

/**
 * Apply language-specific export rules
 * @param {string} language - Language name
 * @param {string} content - File content
 * @param {Set<string>} exportNames - Export name set (in-place)
 * @param {Map} functionMap - Function symbols
 * @param {Map} classMap - Class symbols
 * @param {Map} typeMap - Type symbols
 * @param {Map} constMap - Constant symbols
 */
function applyLanguageExportRules(language, content, exportNames, functionMap, classMap, typeMap, constMap) {
  if (language === 'python') {
    const explicit = extractPythonAll(content);
    if (explicit.length > 0) {
      for (const name of explicit) exportNames.add(name);
    } else {
      addPublicNames(exportNames, functionMap, classMap, typeMap, constMap, name => !name.startsWith('_'));
    }
    return;
  }

  if (language === 'go') {
    addPublicNames(exportNames, functionMap, classMap, typeMap, constMap, name => isExportedGoName(name));
  }
}

/**
 * Extract __all__ exports from Python content
 * @param {string} content - File content
 * @returns {string[]}
 */
function extractPythonAll(content) {
  if (!content) return [];
  const match = content.match(/__all__\s*=\s*[\[(]([\s\S]*?)[\])]\s*/m);
  if (!match) return [];

  const body = match[1];
  const names = [];
  const stringRegex = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = stringRegex.exec(body)) !== null) {
    if (m[1]) names.push(m[1]);
  }
  return names;
}

/**
 * Add public names from symbol maps based on predicate
 * @param {Set<string>} exportNames - Export name set
 * @param {...Map} maps - Symbol maps
 * @param {Function} predicate - Function(name) => boolean
 */
function addPublicNames(exportNames, ...args) {
  const predicate = args.pop();
  const maps = args;
  for (const map of maps) {
    for (const name of map.keys()) {
      if (predicate(name)) exportNames.add(name);
    }
  }
}

/**
 * Determine if a Go identifier is exported
 * @param {string} name - Identifier
 * @returns {boolean}
 */
function isExportedGoName(name) {
  if (!name) return false;
  const first = name[0];
  return first.toUpperCase() === first && first.toLowerCase() !== first;
}

/**
 * Ensure export entries exist for inferred exports
 * @param {Map} exportMap - Export map to populate
 * @param {Set<string>} exportNames - Names to ensure
 * @param {Map} functionMap - Function map
 * @param {Map} classMap - Class map
 * @param {Map} typeMap - Type map
 * @param {Map} constMap - Constant map
 */
function ensureExportEntries(exportMap, exportNames, functionMap, classMap, typeMap, constMap) {
  const sources = [functionMap, classMap, typeMap, constMap];

  for (const name of exportNames) {
    if (exportMap.has(name)) continue;

    let entry = null;
    for (const map of sources) {
      if (map.has(name)) {
        const item = map.get(name);
        entry = { name, line: item.line, kind: item.kind };
        break;
      }
    }

    if (!entry) {
      entry = { name, line: null, kind: 'export' };
    }

    exportMap.set(name, entry);
  }
}

/**
 * Convert symbol map to sorted array and mark exported flags
 * @param {Map} map - Symbol map
 * @param {Set<string>} [exportNames] - Export name set
 * @returns {Array}
 */
function mapToSortedArray(map, exportNames) {
  const list = Array.from(map.values());
  if (exportNames) {
    for (const item of list) {
      item.exported = exportNames.has(item.name);
    }
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

/**
 * Get git info for the repository
 * @param {string} basePath - Repository root
 * @returns {Object|null}
 */
function getGitInfo(basePath) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: basePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: basePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    
    return { commit, branch };
  } catch {
    return null;
  }
}

/**
 * Detect primary project type from languages
 * @param {string[]} languages - Detected languages
 * @returns {string}
 */
function detectProjectType(languages) {
  // Priority order
  const priority = ['typescript', 'javascript', 'python', 'rust', 'go', 'java'];
  for (const lang of priority) {
    if (languages.includes(lang)) {
      return lang === 'typescript' ? 'node' : lang;
    }
  }
  return languages[0] || 'unknown';
}

/**
 * Scan a single file (for incremental updates)
 * @param {string} cmd - ast-grep command
 * @param {string} file - File path
 * @param {string} basePath - Repository root
 * @returns {Object|null} - File data or null if failed
 */
function scanSingleFile(cmd, file, basePath) {
  const ext = path.extname(file).toLowerCase();

  // Find language for this extension
  let language = null;
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) {
      language = lang;
      break;
    }
  }

  if (!language) return null;

  const langQueries = queries.getQueriesForLanguage(language);
  if (!langQueries) return null;

  try {
    const content = fs.readFileSync(file, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    const symbols = extractSymbols(cmd, file, language, langQueries, basePath, content);
    const imports = extractImports(cmd, file, language, langQueries, basePath);

    return {
      hash,
      language,
      size: content.length,
      symbols,
      imports
    };
  } catch {
    return null;
  }
}

/**
 * Scan a single file asynchronously (for incremental updates)
 * Uses async file read, but ast-grep subprocess remains synchronous
 * @param {string} cmd - ast-grep command
 * @param {string} file - File path
 * @param {string} basePath - Repository root
 * @returns {Promise<Object|null>} - File data or null if failed
 */
async function scanSingleFileAsync(cmd, file, basePath) {
  const ext = path.extname(file).toLowerCase();

  // Find language for this extension
  let language = null;
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) {
      language = lang;
      break;
    }
  }

  if (!language) return null;

  const langQueries = queries.getQueriesForLanguage(language);
  if (!langQueries) return null;

  try {
    const content = await fsPromises.readFile(file, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    const symbols = extractSymbols(cmd, file, language, langQueries, basePath, content);
    const imports = extractImports(cmd, file, language, langQueries, basePath);

    return {
      hash,
      language,
      size: content.length,
      symbols,
      imports
    };
  } catch {
    return null;
  }
}

module.exports = {
  detectLanguages,
  fullScan,
  findFilesForLanguage,
  collectFilesByLanguage,
  scanSingleFile,
  scanSingleFileAsync,
  runAstGrep,
  getGitInfo,
  batchReadFiles,
  LANGUAGE_EXTENSIONS,
  EXCLUDE_DIRS
};
