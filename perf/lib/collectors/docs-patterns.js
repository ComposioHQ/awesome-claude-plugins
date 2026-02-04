/**
 * Documentation Patterns Collector
 *
 * Specialized patterns for sync-docs: finding related docs,
 * detecting outdated references, and analyzing doc issues.
 *
 * @module lib/collectors/docs-patterns
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_OPTIONS = {
  cwd: process.cwd()
};

/**
 * Find documentation files related to changed source files
 * @param {string[]} changedFiles - List of changed file paths
 * @param {Object} options - Options
 * @returns {Array<Object>} Related docs with reference types
 */
function findRelatedDocs(changedFiles, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;
  const results = [];

  // Find all markdown files
  const docFiles = findMarkdownFiles(basePath);

  for (const file of changedFiles) {
    const basename = path.basename(file).replace(/\.[^.]+$/, '');
    const modulePath = file.replace(/\.[^.]+$/, '');
    const dirName = path.dirname(file);

    for (const doc of docFiles) {
      let content;
      try {
        content = fs.readFileSync(path.join(basePath, doc), 'utf8');
      } catch {
        continue;
      }

      const references = [];

      // Check for various reference types
      if (content.includes(basename)) {
        references.push('filename');
      }
      if (content.includes(file)) {
        references.push('full-path');
      }
      if (content.includes(`from '${modulePath}'`) || content.includes(`from "${modulePath}"`)) {
        references.push('import');
      }
      if (content.includes(`require('${modulePath}')`) || content.includes(`require("${modulePath}")`)) {
        references.push('require');
      }
      if (content.includes(`/${basename}`) || content.includes(`/${basename}.`)) {
        references.push('url-path');
      }

      if (references.length > 0) {
        results.push({
          doc,
          referencedFile: file,
          referenceTypes: references
        });
      }
    }
  }

  return results;
}

/**
 * Find all markdown files in the repository
 * @param {string} basePath - Repository root
 * @returns {string[]} List of markdown file paths
 */
function findMarkdownFiles(basePath) {
  const files = [];
  const excludeDirs = ['node_modules', 'dist', 'build', '.git', 'coverage', 'vendor'];

  function scan(dir, depth = 0) {
    if (depth > 5 || files.length > 200) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            scan(fullPath, depth + 1);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(relativePath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  scan(basePath);
  return files;
}

/**
 * Analyze a documentation file for issues
 * @param {string} docPath - Path to the doc file
 * @param {string} changedFile - Path of the changed source file
 * @param {Object} options - Options
 * @returns {Array<Object>} List of issues found
 */
function analyzeDocIssues(docPath, changedFile, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;
  const issues = [];

  let content;
  try {
    content = fs.readFileSync(path.join(basePath, docPath), 'utf8');
  } catch {
    return issues;
  }

  const lines = content.split('\n');

  // 1. Check code blocks for outdated imports
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = content.match(codeBlockRegex) || [];

  for (const block of codeBlocks) {
    const importRegex = /import .* from ['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(block)) !== null) {
      const importPath = match[1];
      const changedModulePath = changedFile.replace(/\.[^.]+$/, '');
      if (importPath.includes(path.basename(changedModulePath))) {
        issues.push({
          type: 'code-example',
          severity: 'medium',
          line: findLineNumber(content, match[0]),
          current: match[0],
          suggestion: 'Verify import path is still valid'
        });
      }
    }
  }

  // 2. Check for function/export references that may have changed
  const oldExports = getExportsFromGit(changedFile, 'HEAD~1', opts);
  const newExports = getExportsFromGit(changedFile, 'HEAD', opts);

  const removed = oldExports.filter(e => !newExports.includes(e));
  for (const fn of removed) {
    if (content.includes(fn)) {
      issues.push({
        type: 'removed-export',
        severity: 'high',
        reference: fn,
        suggestion: `'${fn}' was removed or renamed`
      });
    }
  }

  // 3. Check for outdated version numbers
  try {
    const pkgContent = fs.readFileSync(path.join(basePath, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgContent);
    const currentVersion = pkg.version;

    const versionMatches = content.matchAll(/version[:\s]+['"]?(\d+\.\d+\.\d+)/gi);
    for (const match of versionMatches) {
      const docVersion = match[1];
      if (docVersion !== currentVersion && compareVersions(docVersion, currentVersion) < 0) {
        issues.push({
          type: 'outdated-version',
          severity: 'low',
          line: findLineNumber(content, match[0]),
          current: docVersion,
          expected: currentVersion,
          suggestion: `Update version from ${docVersion} to ${currentVersion}`
        });
      }
    }
  } catch {
    // No package.json or parse error
  }

  return issues;
}

/**
 * Find line number of a string in content
 * @param {string} content - Full content
 * @param {string} search - String to find
 * @returns {number} Line number (1-indexed)
 */
function findLineNumber(content, search) {
  const index = content.indexOf(search);
  if (index === -1) return 0;
  return content.substring(0, index).split('\n').length;
}

/**
 * Validate git ref format (e.g., HEAD, HEAD~1, branch names)
 * @param {string} ref - Git ref to validate
 * @returns {boolean} True if valid
 */
function isValidGitRef(ref) {
  if (typeof ref !== 'string' || !ref) return false;
  // Allow: HEAD, HEAD~N, HEAD^N, branch names (alphanumeric, /, -, _, .)
  // Reject: shell metacharacters, spaces, null bytes
  return /^[a-zA-Z0-9_./-]+(?:[~^][0-9]+)?$/.test(ref);
}

/**
 * Get exports from a file at a specific git ref
 * @param {string} filePath - File path
 * @param {string} ref - Git ref (HEAD, HEAD~1, etc.)
 * @param {Object} options - Options
 * @returns {string[]} List of export names
 */
function getExportsFromGit(filePath, ref, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate ref to prevent command injection
  if (!isValidGitRef(ref)) {
    return [];
  }

  try {
    // Use execFileSync with arguments array to prevent command injection
    // git show requires the ref:path as a single argument
    const content = execFileSync('git', ['show', `${ref}:${filePath}`], {
      cwd: opts.cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const exports = [];

    // Export patterns
    const patterns = [
      /export\s+(?:function|class|const|let|var)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
      /module\.exports\s*=\s*\{([^}]+)\}/
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1].includes(',')) {
          // Multiple exports
          const names = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
          exports.push(...names.filter(n => n && /^\w+$/.test(n)));
        } else {
          exports.push(match[1]);
        }
      }
    }

    return [...new Set(exports)];
  } catch {
    return [];
  }
}

/**
 * Compare semantic versions
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * Check CHANGELOG for undocumented changes
 * @param {string[]} changedFiles - Changed files
 * @param {Object} options - Options
 * @returns {Object} CHANGELOG status
 */
function checkChangelog(changedFiles, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;
  const changelogPath = path.join(basePath, 'CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) {
    return { exists: false };
  }

  let changelog;
  try {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  } catch {
    return { exists: false, error: 'Could not read CHANGELOG.md' };
  }

  const hasUnreleased = changelog.includes('## [Unreleased]');

  // Get recent commits
  let recentCommits = [];
  try {
    // Use execFileSync with arguments array for safer execution
    const output = execFileSync('git', ['log', '--oneline', '-10', 'HEAD'], {
      cwd: basePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    recentCommits = output.trim().split('\n');
  } catch {
    // Git command failed
  }

  const documented = [];
  const undocumented = [];

  for (const commit of recentCommits) {
    if (!commit) continue;
    const msg = commit.substring(8); // Skip hash
    if (changelog.includes(msg) || changelog.includes(commit.substring(0, 7))) {
      documented.push(msg);
    } else if (msg.match(/^(feat|fix|breaking)/i)) {
      undocumented.push(msg);
    }
  }

  return {
    exists: true,
    hasUnreleased,
    documented,
    undocumented,
    suggestion: undocumented.length > 0
      ? `${undocumented.length} commits may need CHANGELOG entries`
      : null
  };
}

/**
 * Collect all documentation-related data
 * @param {Object} options - Collection options
 * @returns {Object} Collected data
 */
function collect(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const changedFiles = opts.changedFiles || [];

  return {
    relatedDocs: findRelatedDocs(changedFiles, opts),
    changelog: checkChangelog(changedFiles, opts),
    markdownFiles: findMarkdownFiles(opts.cwd)
  };
}

module.exports = {
  DEFAULT_OPTIONS,
  findRelatedDocs,
  findMarkdownFiles,
  analyzeDocIssues,
  checkChangelog,
  getExportsFromGit,
  compareVersions,
  findLineNumber,
  collect
};
