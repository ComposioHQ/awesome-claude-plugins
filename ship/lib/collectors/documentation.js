/**
 * Documentation Collector
 *
 * Analyzes documentation files: README, PLAN, CHANGELOG, etc.
 * Extracted from drift-detect/collectors.js for shared use.
 *
 * @module lib/collectors/documentation
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_OPTIONS = {
  depth: 'thorough',
  cwd: process.cwd()
};

/**
 * Validate file path to prevent path traversal
 * @param {string} filePath - Path to validate
 * @param {string} basePath - Base directory
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath, basePath) {
  const resolved = path.resolve(basePath, filePath);
  return resolved.startsWith(path.resolve(basePath));
}

/**
 * Safe file read with path validation
 * @param {string} filePath - Path to read
 * @param {string} basePath - Base directory for validation
 * @returns {string|null} File contents or null
 */
function safeReadFile(filePath, basePath) {
  const fullPath = path.resolve(basePath, filePath);
  if (!isPathSafe(filePath, basePath)) {
    return null;
  }
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Analyze a single markdown file
 */
function analyzeMarkdownFile(content, filePath) {
  const sectionMatches = content.match(/^##\s+(.+)$/gm) || [];
  const sections = sectionMatches.slice(0, 10).map(s => s.replace(/^##\s+/, ''));
  const sectionLower = sections.map(s => s.toLowerCase()).join(' ');

  return {
    path: filePath,
    sectionCount: sectionMatches.length,
    sections,
    hasInstallation: /install|setup|getting.started/i.test(sectionLower),
    hasUsage: /usage|how.to|example/i.test(sectionLower),
    hasApi: /api|reference|methods/i.test(sectionLower),
    hasTesting: /test|spec|coverage/i.test(sectionLower),
    codeBlocks: Math.floor((content.match(/```/g) || []).length / 2),
    wordCount: content.split(/\s+/).length
  };
}

/**
 * Extract checkboxes from content
 */
function extractCheckboxes(result, content) {
  const checked = (content.match(/^[-*]\s+\[x\]/gim) || []).length;
  const unchecked = (content.match(/^[-*]\s+\[\s\]/gim) || []).length;

  result.checkboxes.checked += checked;
  result.checkboxes.unchecked += unchecked;
  result.checkboxes.total += checked + unchecked;
}

/**
 * Extract documented features
 */
function extractFeatures(result, content) {
  const featurePattern = /^[-*]\s+\*{0,2}(.+?)\*{0,2}(?:\s*[-–]\s*(.+))?$/gm;
  let match;

  while ((match = featurePattern.exec(content)) !== null && result.features.length < 20) {
    const feature = match[1].trim();
    if (feature.length > 5 && feature.length < 80) {
      result.features.push(feature);
    }
  }

  result.features = [...new Set(result.features)].slice(0, 20);
}

/**
 * Extract planned items from content
 */
function extractPlans(result, content) {
  const planPatterns = [
    /(?:TODO|FIXME|PLAN):\s*(.+)/gi,
    /^##\s+(?:Roadmap|Future|Planned|Coming Soon)/gim
  ];

  for (const pattern of planPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null && result.plans.length < 15) {
      const plan = (match[1] || match[0]).slice(0, 100);
      result.plans.push(plan);
    }
  }
}

/**
 * Identify documentation gaps
 */
function identifyDocGaps(result) {
  const readme = result.files['README.md'];

  if (!readme) {
    result.gaps.push({ type: 'missing', file: 'README.md', severity: 'high' });
  } else {
    if (!readme.hasInstallation) {
      result.gaps.push({ type: 'missing-section', file: 'README.md', section: 'Installation', severity: 'medium' });
    }
    if (!readme.hasUsage) {
      result.gaps.push({ type: 'missing-section', file: 'README.md', section: 'Usage', severity: 'medium' });
    }
  }

  if (!result.files['CHANGELOG.md']) {
    result.gaps.push({ type: 'missing', file: 'CHANGELOG.md', severity: 'low' });
  }
}

/**
 * Analyze documentation files
 * @param {Object} options - Collection options
 * @returns {Object} Documentation analysis
 */
function analyzeDocumentation(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;

  const result = {
    summary: { fileCount: 0, totalWords: 0 },
    files: {},
    features: [],
    plans: [],
    checkboxes: { total: 0, checked: 0, unchecked: 0 },
    gaps: []
  };

  const docFiles = [
    'README.md',
    'PLAN.md',
    'CLAUDE.md',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'docs/README.md',
    'docs/PLAN.md'
  ];

  for (const file of docFiles) {
    const content = safeReadFile(file, basePath);
    if (content) {
      const analysis = analyzeMarkdownFile(content, file);
      result.files[file] = analysis;
      result.summary.totalWords += analysis.wordCount;
      extractCheckboxes(result, content);
      extractFeatures(result, content);
      extractPlans(result, content);
    }
  }

  // Find additional markdown files if depth is thorough
  if (opts.depth === 'thorough') {
    const docsDir = path.join(basePath, 'docs');
    if (fs.existsSync(docsDir)) {
      try {
        const additionalFiles = fs.readdirSync(docsDir)
          .filter(f => f.endsWith('.md') && !docFiles.includes(`docs/${f}`));

        for (const file of additionalFiles.slice(0, 5)) {
          const filePath = `docs/${file}`;
          const content = safeReadFile(filePath, basePath);
          if (content) {
            const analysis = analyzeMarkdownFile(content, filePath);
            result.files[filePath] = analysis;
            result.summary.totalWords += analysis.wordCount;
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }
  }

  result.summary.fileCount = Object.keys(result.files).length;
  identifyDocGaps(result);

  return result;
}

module.exports = {
  DEFAULT_OPTIONS,
  analyzeDocumentation,
  analyzeMarkdownFile,
  safeReadFile,
  isPathSafe,
  extractCheckboxes,
  extractFeatures,
  extractPlans,
  identifyDocGaps
};
