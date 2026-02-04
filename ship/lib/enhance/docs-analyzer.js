/**
 * Documentation Analyzer
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const { getPatternsForMode, estimateTokens } = require('./docs-patterns');

function analyzeDoc(docPath, options = {}) {
  const { mode = 'both', verbose = false, existingFiles = [] } = options;

  const results = {
    docName: path.basename(docPath, '.md'),
    docPath,
    mode,
    tokenCount: 0,
    linkIssues: [],
    structureIssues: [],
    codeIssues: [],
    efficiencyIssues: [],
    ragIssues: [],
    balanceIssues: []
  };

  // Read file
  if (!fs.existsSync(docPath)) {
    results.structureIssues.push({
      issue: 'File not found',
      file: docPath,
      certainty: 'HIGH',
      patternId: 'file_not_found'
    });
    return results;
  }

  let content;
  try {
    content = fs.readFileSync(docPath, 'utf8');
  } catch (err) {
    results.structureIssues.push({
      issue: `Failed to read file: ${err.message}`,
      file: docPath,
      certainty: 'HIGH',
      patternId: 'read_error'
    });
    return results;
  }

  // Calculate token count
  results.tokenCount = estimateTokens(content);

  // Get patterns applicable to this mode
  const patterns = getPatternsForMode(mode);

  // Context for pattern checks
  const context = { existingFiles };

  // Run each pattern check
  for (const [patternName, pattern] of Object.entries(patterns)) {
    // Skip LOW certainty unless verbose
    if (pattern.certainty === 'LOW' && !verbose) {
      continue;
    }

    // Run the check
    const result = pattern.check(content, context);

    if (result) {
      const issue = {
        ...result,
        file: docPath,
        certainty: pattern.certainty,
        patternId: pattern.id,
        autoFix: pattern.autoFix
      };

      // Route to appropriate issue category
      switch (pattern.category) {
        case 'link':
          results.linkIssues.push(issue);
          break;
        case 'structure':
          results.structureIssues.push(issue);
          break;
        case 'code':
          results.codeIssues.push(issue);
          break;
        case 'efficiency':
          results.efficiencyIssues.push(issue);
          break;
        case 'rag':
          results.ragIssues.push(issue);
          break;
        case 'balance':
          results.balanceIssues.push(issue);
          break;
        default:
          results.structureIssues.push(issue);
      }
    }
  }

  return results;
}

function analyzeAllDocs(docsDir, options = {}) {
  const { recursive = true, ...analyzeOptions } = options;
  const results = [];

  if (!fs.existsSync(docsDir)) {
    return results;
  }

  // Collect all markdown files
  const mdFiles = [];

  function findMdFiles(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && recursive) {
        // Skip common non-doc directories
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          findMdFiles(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip README files in nested directories for agent-docs mode
        if (options.mode === 'ai' && entry.name === 'README.md') {
          continue;
        }
        mdFiles.push(fullPath);
      }
    }
  }

  findMdFiles(docsDir);

  // Get relative paths for link validation
  const existingFiles = mdFiles.map(f => path.relative(docsDir, f).replace(/\\/g, '/'));

  // Analyze each file
  for (const mdFile of mdFiles) {
    const result = analyzeDoc(mdFile, { ...analyzeOptions, existingFiles });
    results.push(result);
  }

  return results;
}

function analyze(options = {}) {
  const {
    doc,
    docsDir = 'docs',
    mode = 'both',
    verbose = false
  } = options;

  if (doc) {
    // Check if doc is a directory or file
    try {
      const stats = fs.statSync(doc);
      if (stats.isDirectory()) {
        // Analyze all docs in directory
        return analyzeAllDocs(doc, { mode, verbose });
      } else {
        // Analyze single doc
        return analyzeDoc(doc, { mode, verbose });
      }
    } catch (err) {
      // If file doesn't exist, let analyzeDoc handle the error
      return analyzeDoc(doc, { mode, verbose });
    }
  } else {
    // Analyze all docs in directory
    return analyzeAllDocs(docsDir, { mode, verbose });
  }
}

function applyFixes(results, options = {}) {
  // Collect all issues
  let allIssues = [];

  if (Array.isArray(results)) {
    for (const r of results) {
      allIssues.push(...(r.linkIssues || []));
      allIssues.push(...(r.structureIssues || []));
      allIssues.push(...(r.codeIssues || []));
      allIssues.push(...(r.efficiencyIssues || []));
      allIssues.push(...(r.ragIssues || []));
      allIssues.push(...(r.balanceIssues || []));
    }
  } else {
    allIssues.push(...(results.linkIssues || []));
    allIssues.push(...(results.structureIssues || []));
    allIssues.push(...(results.codeIssues || []));
    allIssues.push(...(results.efficiencyIssues || []));
    allIssues.push(...(results.ragIssues || []));
    allIssues.push(...(results.balanceIssues || []));
  }

  // Filter to auto-fixable docs issues
  const docsFixablePatternIds = [
    'inconsistent_heading_levels',
    'verbose_explanations'
  ];

  const fixableIssues = allIssues.filter(i =>
    i.certainty === 'HIGH' &&
    i.autoFix &&
    docsFixablePatternIds.includes(i.patternId)
  );

  // Apply fixes using the fixer module's pattern
  return applyDocsFixes(fixableIssues, options);
}

function applyDocsFixes(issues, options = {}) {
  const { dryRun = false, backup = true } = options;
  const fixer = require('./fixer');

  const results = {
    applied: [],
    skipped: [],
    errors: []
  };

  // Group by file
  const byFile = new Map();
  for (const issue of issues) {
    const fp = issue.file;
    if (!byFile.has(fp)) {
      byFile.set(fp, []);
    }
    byFile.get(fp).push(issue);
  }

  // Process each file
  for (const [filePath, fileIssues] of byFile) {
    try {
      if (!fs.existsSync(filePath)) {
        results.errors.push({ filePath, error: 'File not found' });
        continue;
      }

      let content = fs.readFileSync(filePath, 'utf8');
      const appliedToFile = [];

      for (const issue of fileIssues) {
        try {
          if (issue.patternId === 'inconsistent_heading_levels') {
            content = fixer.fixInconsistentHeadings(content);
            appliedToFile.push({
              issue: issue.issue,
              fix: 'Fixed heading levels',
              filePath
            });
          } else if (issue.patternId === 'verbose_explanations') {
            content = fixer.fixVerboseExplanations(content);
            appliedToFile.push({
              issue: issue.issue,
              fix: 'Simplified verbose phrases',
              filePath
            });
          }
        } catch (err) {
          results.errors.push({
            issue: issue.issue,
            filePath,
            error: err.message
          });
        }
      }

      // Write changes
      if (!dryRun && appliedToFile.length > 0) {
        if (backup) {
          fs.writeFileSync(`${filePath}.backup`, fs.readFileSync(filePath, 'utf8'), 'utf8');
        }
        fs.writeFileSync(filePath, content, 'utf8');
      }

      results.applied.push(...appliedToFile);

    } catch (err) {
      results.errors.push({
        filePath,
        error: err.message
      });
    }
  }

  return results;
}

function generateReport(results, options = {}) {
  const reporter = require('./reporter');

  if (Array.isArray(results)) {
    return reporter.generateDocsSummaryReport(results, options);
  } else {
    return reporter.generateDocsReport(results, options);
  }
}

const fixer = require('./fixer');

module.exports = {
  analyzeDoc,
  analyzeAllDocs,
  analyze,
  applyFixes,
  applyDocsFixes,
  fixInconsistentHeadings: fixer.fixInconsistentHeadings,
  fixVerboseExplanations: fixer.fixVerboseExplanations,
  generateReport
};
