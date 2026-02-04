/**
 * Repo Map Usage Analyzer
 *
 * Cross-file usage tracking to enable deeper analysis:
 * - Unused exports detection
 * - Orphaned infrastructure detection
 * - Symbol dependency mapping
 *
 * @module lib/repo-map/usage-analyzer
 */

'use strict';

const path = require('path');

/**
 * Build a reverse index mapping symbols to their importers
 * @param {Object} repoMap - The repo map object from cache.load()
 * @returns {Object} Usage index: { bySymbol: Map<string, Set<string>>, byFile: Map<string, Set<string>> }
 */
function buildUsageIndex(repoMap) {
  if (!repoMap || !repoMap.files) {
    return { bySymbol: new Map(), byFile: new Map() };
  }

  // bySymbol: symbolName -> Set of files that import it
  // byFile: filePath -> Set of files that depend on it
  const bySymbol = new Map();
  const byFile = new Map();

  // Build export registry: filePath -> Set of exported symbol names
  const exportsByFile = new Map();
  for (const [filePath, fileData] of Object.entries(repoMap.files)) {
    const exports = new Set();
    if (fileData.symbols?.exports) {
      for (const exp of fileData.symbols.exports) {
        exports.add(exp.name);
      }
    }
    exportsByFile.set(filePath, exports);
  }

  // Process imports to build reverse index
  for (const [importerPath, fileData] of Object.entries(repoMap.files)) {
    if (!fileData.imports || fileData.imports.length === 0) continue;

    for (const imp of fileData.imports) {
      const source = imp.source;
      if (!source) continue;

      // Resolve the import source to a file path
      const resolvedPath = resolveImportSource(importerPath, source, repoMap);
      if (!resolvedPath) continue;

      // Track file-level dependency
      if (!byFile.has(resolvedPath)) {
        byFile.set(resolvedPath, new Set());
      }
      byFile.get(resolvedPath).add(importerPath);

      // For named imports, track symbol-level usage
      // The import kind tells us what type of import it is
      if (imp.kind === 'named' || imp.kind === 'import') {
        // Try to extract imported names from the import
        const importedNames = extractImportedNames(imp, source);
        for (const name of importedNames) {
          const symbolKey = `${resolvedPath}:${name}`;
          if (!bySymbol.has(symbolKey)) {
            bySymbol.set(symbolKey, new Set());
          }
          bySymbol.get(symbolKey).add(importerPath);
        }
      }
    }
  }

  return { bySymbol, byFile, exportsByFile };
}

/**
 * Resolve an import source to a file path in the repo map
 * @param {string} importerPath - Path of the importing file
 * @param {string} source - Import source (e.g., './utils', 'lodash', '../lib')
 * @param {Object} repoMap - The repo map
 * @returns {string|null} Resolved file path or null
 */
function resolveImportSource(importerPath, source, repoMap) {
  // Skip external packages
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return null;
  }

  const importerDir = path.dirname(importerPath);
  let candidatePath = path.join(importerDir, source).replace(/\\/g, '/');

  // Normalize the path
  candidatePath = path.normalize(candidatePath).replace(/\\/g, '/');

  // Try direct match
  if (repoMap.files[candidatePath]) {
    return candidatePath;
  }

  // Try with common extensions
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
  for (const ext of extensions) {
    const withExt = candidatePath + ext;
    if (repoMap.files[withExt]) {
      return withExt;
    }
  }

  // Try index file
  for (const ext of extensions) {
    const indexPath = candidatePath + '/index' + ext;
    if (repoMap.files[indexPath]) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Extract imported names from an import statement
 * @param {Object} imp - Import object from repo map
 * @param {string} source - Import source
 * @returns {string[]} List of imported symbol names
 */
function extractImportedNames(imp, source) {
  const names = [];

  // If the import has specific names recorded, use them
  if (imp.names && Array.isArray(imp.names)) {
    return imp.names;
  }

  // For default imports, use the basename as heuristic
  if (imp.kind === 'default') {
    const basename = path.basename(source).replace(/\.[^.]+$/, '');
    names.push(basename);
  }

  return names;
}

/**
 * Find which files import a specific symbol
 * @param {Object} usageIndex - Result from buildUsageIndex
 * @param {string} filePath - File containing the symbol
 * @param {string} symbolName - Name of the symbol
 * @returns {string[]} List of file paths that import this symbol
 */
function findUsages(usageIndex, filePath, symbolName) {
  const symbolKey = `${filePath}:${symbolName}`;
  const usages = usageIndex.bySymbol.get(symbolKey);
  return usages ? Array.from(usages) : [];
}

/**
 * Find files that depend on a given file
 * @param {Object} usageIndex - Result from buildUsageIndex
 * @param {string} filePath - Path to the file
 * @returns {string[]} List of file paths that import from this file
 */
function findDependents(usageIndex, filePath) {
  const dependents = usageIndex.byFile.get(filePath);
  return dependents ? Array.from(dependents) : [];
}

/**
 * Find exports that are never imported anywhere
 * @param {Object} repoMap - The repo map
 * @param {Object} usageIndex - Result from buildUsageIndex (optional, will build if not provided)
 * @returns {Array<Object>} Unused exports: { file, name, line, kind }
 */
function findUnusedExports(repoMap, usageIndex = null) {
  if (!repoMap || !repoMap.files) {
    return [];
  }

  const index = usageIndex || buildUsageIndex(repoMap);
  const unusedExports = [];

  for (const [filePath, fileData] of Object.entries(repoMap.files)) {
    if (!fileData.symbols?.exports) continue;

    // Check if the file itself is used
    const fileDependents = index.byFile.get(filePath);
    const fileIsImported = fileDependents && fileDependents.size > 0;

    for (const exp of fileData.symbols.exports) {
      const symbolKey = `${filePath}:${exp.name}`;
      const symbolUsages = index.bySymbol.get(symbolKey);
      const symbolIsUsed = symbolUsages && symbolUsages.size > 0;

      // Check if this specific symbol is unused
      // A file can be imported for some symbols but have other unused exports
      if (!symbolIsUsed) {
        // Skip entry points (index.js, main.js, etc.)
        if (isEntryPoint(filePath)) continue;

        unusedExports.push({
          file: filePath,
          name: exp.name,
          line: exp.line,
          kind: exp.kind || 'export',
          // Higher certainty if file itself isn't imported at all
          certainty: fileIsImported ? 'LOW' : 'MEDIUM'
        });
      }
    }
  }

  return unusedExports;
}

/**
 * Check if a file is likely an entry point
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function isEntryPoint(filePath) {
  const basename = path.basename(filePath);
  const entryNames = ['index', 'main', 'app', 'server', 'cli', 'bin'];
  const nameWithoutExt = basename.replace(/\.[^.]+$/, '').toLowerCase();

  return entryNames.includes(nameWithoutExt);
}

/**
 * Find orphaned infrastructure - components that are set up but never used
 * Uses repo map for AST-based detection (higher certainty than regex)
 * @param {Object} repoMap - The repo map
 * @param {Object} usageIndex - Result from buildUsageIndex (optional)
 * @returns {Array<Object>} Orphaned infrastructure: { file, name, line, kind, certainty }
 */
function findOrphanedInfrastructure(repoMap, usageIndex = null) {
  if (!repoMap || !repoMap.files) {
    return [];
  }

  const index = usageIndex || buildUsageIndex(repoMap);
  const orphaned = [];

  // Infrastructure component suffixes
  const infrastructureSuffixes = [
    'Client', 'Connection', 'Pool', 'Service', 'Provider',
    'Manager', 'Factory', 'Repository', 'Gateway', 'Adapter',
    'Handler', 'Broker', 'Queue', 'Cache', 'Store',
    'Transport', 'Channel', 'Socket', 'Server', 'Database'
  ];

  // Build regex for infrastructure detection
  const suffixPattern = new RegExp(`(${infrastructureSuffixes.join('|')})$`);

  for (const [filePath, fileData] of Object.entries(repoMap.files)) {
    // Check classes
    if (fileData.symbols?.classes) {
      for (const cls of fileData.symbols.classes) {
        if (!suffixPattern.test(cls.name)) continue;

        // Check if this class is exported and used
        const isExported = cls.exported === true;
        if (!isExported) continue;

        const symbolKey = `${filePath}:${cls.name}`;
        const usages = index.bySymbol.get(symbolKey);
        const fileDependents = index.byFile.get(filePath);

        if ((!usages || usages.size === 0) && (!fileDependents || fileDependents.size === 0)) {
          orphaned.push({
            file: filePath,
            name: cls.name,
            line: cls.line,
            kind: 'class',
            type: 'infrastructure',
            certainty: 'HIGH' // AST-based detection
          });
        }
      }
    }

    // Check functions that look like factory/builder patterns
    if (fileData.symbols?.functions) {
      const factoryPatterns = [
        /^create[A-Z]/,
        /^make[A-Z]/,
        /^build[A-Z]/,
        /^new[A-Z]/,
        /^init[A-Z]/,
        /^setup[A-Z]/,
        /^connect[A-Z]/
      ];

      for (const fn of fileData.symbols.functions) {
        const isFactory = factoryPatterns.some(p => p.test(fn.name));
        if (!isFactory) continue;

        const isExported = fn.exported === true;
        if (!isExported) continue;

        const symbolKey = `${filePath}:${fn.name}`;
        const usages = index.bySymbol.get(symbolKey);
        const fileDependents = index.byFile.get(filePath);

        if ((!usages || usages.size === 0) && (!fileDependents || fileDependents.size === 0)) {
          orphaned.push({
            file: filePath,
            name: fn.name,
            line: fn.line,
            kind: 'function',
            type: 'factory',
            certainty: 'HIGH'
          });
        }
      }
    }
  }

  return orphaned;
}

/**
 * Get dependency graph for visualization or analysis
 * @param {Object} repoMap - The repo map
 * @returns {Object} Graph: { nodes: string[], edges: Array<{from, to}> }
 */
function getDependencyGraph(repoMap) {
  if (!repoMap || !repoMap.files) {
    return { nodes: [], edges: [] };
  }

  const nodes = Object.keys(repoMap.files);
  const edges = [];

  for (const [filePath, fileData] of Object.entries(repoMap.files)) {
    if (!fileData.imports) continue;

    for (const imp of fileData.imports) {
      const resolved = resolveImportSource(filePath, imp.source, repoMap);
      if (resolved) {
        edges.push({ from: filePath, to: resolved });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Find circular dependencies
 * @param {Object} repoMap - The repo map
 * @returns {Array<string[]>} List of cycles (each cycle is array of file paths)
 */
function findCircularDependencies(repoMap) {
  const graph = getDependencyGraph(repoMap);
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const path = [];

  function dfs(node) {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.edges
      .filter(e => e.from === node)
      .map(e => e.to);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycles.push([...cycle, neighbor]);
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

module.exports = {
  buildUsageIndex,
  findUsages,
  findDependents,
  findUnusedExports,
  findOrphanedInfrastructure,
  getDependencyGraph,
  findCircularDependencies,
  // Expose helpers for testing
  resolveImportSource,
  isEntryPoint
};
