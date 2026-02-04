const fs = require('fs');
const path = require('path');

/**
 * Run pattern detection benchmarks against a manifest of test fixtures
 * @param {string} manifestPath - Path to the manifest.json file
 * @param {Object} analyzers - Map of analyzer names to analyzer functions
 * @returns {Object} Benchmark results with byPattern, byFixture, and summary metrics
 */
function runPatternBenchmarks(manifestPath, analyzers) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const fixturesDir = path.dirname(manifestPath);

  const results = {
    byPattern: {},
    byFixture: {},
    summary: {
      totalFixtures: 0,
      totalExpectedFindings: 0,
      totalActualFindings: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0
    }
  };

  // Process each fixture
  for (const [fixturePath, expectations] of Object.entries(manifest.fixtures || {})) {
    const fullPath = path.join(fixturesDir, fixturePath);

    if (!fs.existsSync(fullPath)) {
      results.byFixture[fixturePath] = { error: 'File not found' };
      continue;
    }

    results.summary.totalFixtures++;

    // Run appropriate analyzer
    const analyzer = analyzers[expectations.analyzer];
    if (!analyzer) {
      results.byFixture[fixturePath] = { error: `Unknown analyzer: ${expectations.analyzer}` };
      continue;
    }

    let findings;
    try {
      findings = analyzer(fullPath);
    } catch (err) {
      results.byFixture[fixturePath] = { error: err.message };
      continue;
    }

    // Extract pattern IDs from findings
    const foundPatternsArray = extractPatternIds(findings);
    const foundPatterns = new Set(foundPatternsArray);
    const expectedPatterns = new Set(expectations.expectedPatterns || []);
    const mustNotTrigger = new Set(expectations.mustNotTrigger || []);

    // Calculate metrics for this fixture
    const fixtureResult = {
      expected: Array.from(expectedPatterns),
      found: foundPatternsArray,
      truePositives: [],
      falsePositives: [],
      falseNegatives: [],
      mustNotTriggerViolations: []
    };

    // True positives: expected AND found
    for (const pattern of expectedPatterns) {
      if (foundPatterns.has(pattern)) {
        fixtureResult.truePositives.push(pattern);
        results.summary.truePositives++;
        updatePatternStats(results.byPattern, pattern, 'tp');
      } else {
        fixtureResult.falseNegatives.push(pattern);
        results.summary.falseNegatives++;
        updatePatternStats(results.byPattern, pattern, 'fn');
      }
    }

    // False positives: found but NOT expected
    for (const pattern of foundPatterns) {
      if (!expectedPatterns.has(pattern)) {
        fixtureResult.falsePositives.push(pattern);
        results.summary.falsePositives++;
        updatePatternStats(results.byPattern, pattern, 'fp');
      }
    }

    // Must-not-trigger violations
    for (const pattern of mustNotTrigger) {
      if (foundPatterns.has(pattern)) {
        fixtureResult.mustNotTriggerViolations.push(pattern);
      }
    }

    results.summary.totalExpectedFindings += expectedPatterns.size;
    results.summary.totalActualFindings += foundPatterns.length;
    results.byFixture[fixturePath] = fixtureResult;
  }

  // Calculate precision and recall per pattern
  for (const [pattern, stats] of Object.entries(results.byPattern)) {
    stats.precision = stats.tp / (stats.tp + stats.fp) || 0;
    stats.recall = stats.tp / (stats.tp + stats.fn) || 0;
    stats.f1 = 2 * (stats.precision * stats.recall) / (stats.precision + stats.recall) || 0;
  }

  // Calculate overall metrics
  const { truePositives, falsePositives, falseNegatives } = results.summary;
  results.summary.precision = truePositives / (truePositives + falsePositives) || 0;
  results.summary.recall = truePositives / (truePositives + falseNegatives) || 0;
  results.summary.f1 = 2 * (results.summary.precision * results.summary.recall) /
    (results.summary.precision + results.summary.recall) || 0;

  return results;
}

/**
 * Run fix effectiveness benchmarks against before/after file pairs
 * @param {string} manifestPath - Path to the manifest.json file
 * @param {Object} options - Options containing fixer and analyzers
 * @param {Object} options.fixer - Fixer module with fix functions
 * @param {Object} options.analyzers - Map of analyzer names to analyzer functions
 * @returns {Object} Fix benchmark results with byPair and summary metrics
 */
function runFixBenchmarks(manifestPath, options = {}) {
  const { fixer, analyzers } = options;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const fixturesDir = path.dirname(manifestPath);

  const results = {
    byPair: {},
    summary: {
      totalPairs: 0,
      fixesApplied: 0,
      findingsRemoved: 0,
      regressions: 0,
      matchesExpected: 0
    }
  };

  for (const [pairName, pairConfig] of Object.entries(manifest.fixPairs || {})) {
    const beforePath = path.join(fixturesDir, pairConfig.before);
    const afterPath = path.join(fixturesDir, pairConfig.after);

    if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
      results.byPair[pairName] = { error: 'Before or after file not found' };
      continue;
    }

    results.summary.totalPairs++;

    const beforeContent = fs.readFileSync(beforePath, 'utf8');
    const expectedAfter = fs.readFileSync(afterPath, 'utf8');

    // Apply fix to before content
    const fixFn = fixer[`fix${toPascalCase(pairConfig.pattern)}`];
    if (!fixFn) {
      results.byPair[pairName] = { error: `No fixer for pattern: ${pairConfig.pattern}` };
      continue;
    }

    let actualAfter;
    try {
      actualAfter = fixFn(beforeContent);
      results.summary.fixesApplied++;
    } catch (err) {
      results.byPair[pairName] = { error: `Fix failed: ${err.message}` };
      continue;
    }

    // Check if finding is removed after fix
    const analyzer = analyzers[pairConfig.analyzer || 'prompt'];
    let beforeFindings = [];
    let afterFindings = [];

    if (analyzer) {
      // Create temp files to analyze
      const tempBefore = path.join(fixturesDir, '.temp-before.md');
      const tempAfter = path.join(fixturesDir, '.temp-after.md');

      try {
        fs.writeFileSync(tempBefore, beforeContent);
        fs.writeFileSync(tempAfter, actualAfter);

        beforeFindings = extractPatternIds(analyzer(tempBefore));
        afterFindings = extractPatternIds(analyzer(tempAfter));
      } finally {
        // Cleanup temp files
        try { fs.unlinkSync(tempBefore); } catch { /* cleanup - ignore */ }
        try { fs.unlinkSync(tempAfter); } catch { /* cleanup - ignore */ }
      }
    }

    const pairResult = {
      pattern: pairConfig.pattern,
      beforeHadPattern: beforeFindings.includes(pairConfig.pattern),
      afterHasPattern: afterFindings.includes(pairConfig.pattern),
      findingRemoved: beforeFindings.includes(pairConfig.pattern) &&
                      !afterFindings.includes(pairConfig.pattern),
      matchesExpected: normalizeWhitespace(actualAfter) === normalizeWhitespace(expectedAfter),
      newFindings: afterFindings.filter(f => !beforeFindings.includes(f))
    };

    if (pairResult.findingRemoved) {
      results.summary.findingsRemoved++;
    }
    if (pairResult.matchesExpected) {
      results.summary.matchesExpected++;
    }
    if (pairResult.newFindings.length > 0) {
      results.summary.regressions++;
    }

    results.byPair[pairName] = pairResult;
  }

  return results;
}

/**
 * Generate a markdown report from benchmark results
 * @param {Object} patternResults - Results from runPatternBenchmarks
 * @param {Object|null} fixResults - Optional results from runFixBenchmarks
 * @returns {string} Markdown-formatted benchmark report
 */
function generateReport(patternResults, fixResults = null) {
  const lines = [];

  lines.push('# Pattern Validation Benchmark Report');
  lines.push('');
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  lines.push('');

  // Overall summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Fixtures | ${patternResults.summary.totalFixtures} |`);
  lines.push(`| True Positives | ${patternResults.summary.truePositives} |`);
  lines.push(`| False Positives | ${patternResults.summary.falsePositives} |`);
  lines.push(`| False Negatives | ${patternResults.summary.falseNegatives} |`);
  lines.push(`| **Precision** | **${(patternResults.summary.precision * 100).toFixed(1)}%** |`);
  lines.push(`| **Recall** | **${(patternResults.summary.recall * 100).toFixed(1)}%** |`);
  lines.push(`| **F1 Score** | **${(patternResults.summary.f1 * 100).toFixed(1)}%** |`);
  lines.push('');

  // Per-pattern metrics
  lines.push('## Pattern Health');
  lines.push('');
  lines.push('| Pattern | TP | FP | FN | Precision | Recall | F1 |');
  lines.push('|---------|----|----|----|-----------:|-------:|----:|');

  const sortedPatterns = Object.entries(patternResults.byPattern)
    .sort((a, b) => a[1].precision - b[1].precision);

  for (const [pattern, stats] of sortedPatterns) {
    const prec = (stats.precision * 100).toFixed(0);
    const rec = (stats.recall * 100).toFixed(0);
    const f1 = (stats.f1 * 100).toFixed(0);
    lines.push(`| ${pattern} | ${stats.tp} | ${stats.fp} | ${stats.fn} | ${prec}% | ${rec}% | ${f1}% |`);
  }
  lines.push('');

  // Fix effectiveness (if provided)
  if (fixResults) {
    lines.push('## Fix Effectiveness');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Fix Pairs | ${fixResults.summary.totalPairs} |`);
    lines.push(`| Fixes Applied | ${fixResults.summary.fixesApplied} |`);
    lines.push(`| Findings Removed | ${fixResults.summary.findingsRemoved} |`);
    lines.push(`| Matches Expected | ${fixResults.summary.matchesExpected} |`);
    lines.push(`| Regressions | ${fixResults.summary.regressions} |`);
    lines.push('');

    // Per-pair details
    lines.push('### Fix Pair Details');
    lines.push('');
    lines.push('| Pair | Pattern | Removed | Matches | Regressions |');
    lines.push('|------|---------|---------|---------|-------------|');

    for (const [pair, result] of Object.entries(fixResults.byPair)) {
      if (result.error) {
        lines.push(`| ${pair} | - | ERROR | - | ${result.error} |`);
      } else {
        const removed = result.findingRemoved ? 'Yes' : 'No';
        const matches = result.matchesExpected ? 'Yes' : 'No';
        const regs = result.newFindings.length > 0 ? result.newFindings.join(', ') : 'None';
        lines.push(`| ${pair} | ${result.pattern} | ${removed} | ${matches} | ${regs} |`);
      }
    }
    lines.push('');
  }

  // Failing fixtures
  const failingFixtures = Object.entries(patternResults.byFixture)
    .filter(([_, result]) =>
      result.falseNegatives?.length > 0 ||
      result.falsePositives?.length > 0 ||
      result.mustNotTriggerViolations?.length > 0
    );

  if (failingFixtures.length > 0) {
    lines.push('## Issues Found');
    lines.push('');

    for (const [fixture, result] of failingFixtures) {
      lines.push(`### ${fixture}`);
      if (result.falseNegatives?.length > 0) {
        lines.push(`- **False Negatives**: ${result.falseNegatives.join(', ')}`);
      }
      if (result.falsePositives?.length > 0) {
        lines.push(`- **False Positives**: ${result.falsePositives.join(', ')}`);
      }
      if (result.mustNotTriggerViolations?.length > 0) {
        lines.push(`- **Must-Not-Trigger Violations**: ${result.mustNotTriggerViolations.join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function extractPatternIds(findings) {
  const ids = [];

  if (Array.isArray(findings)) {
    for (const f of findings) {
      if (f.patternId) ids.push(f.patternId);
    }
  } else if (findings && typeof findings === 'object') {
    // Handle analyzer result objects with issue arrays
    for (const value of Object.values(findings)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item.patternId) ids.push(item.patternId);
        }
      }
    }
  }

  return ids;
}

function updatePatternStats(byPattern, pattern, type) {
  if (!byPattern[pattern]) {
    byPattern[pattern] = { tp: 0, fp: 0, fn: 0 };
  }
  byPattern[pattern][type]++;
}

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function toPascalCase(str) {
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Assert benchmark results meet specified thresholds (for CI gates)
 * @param {Object} results - Results from runPatternBenchmarks
 * @param {Object} thresholds - Threshold configuration
 * @param {number} [thresholds.minPrecision=0.8] - Minimum precision (0-1)
 * @param {number} [thresholds.minRecall=0.8] - Minimum recall (0-1)
 * @param {number} [thresholds.minF1=0.8] - Minimum F1 score (0-1)
 * @param {number} [thresholds.maxFalsePositives=10] - Maximum allowed false positives
 * @throws {Error} If any threshold is not met
 */
function assertThresholds(results, thresholds = {}) {
  const {
    minPrecision = 0.8,
    minRecall = 0.8,
    minF1 = 0.8,
    maxFalsePositives = 10
  } = thresholds;

  const errors = [];

  if (results.summary.precision < minPrecision) {
    errors.push(`Precision ${(results.summary.precision * 100).toFixed(1)}% below threshold ${minPrecision * 100}%`);
  }
  if (results.summary.recall < minRecall) {
    errors.push(`Recall ${(results.summary.recall * 100).toFixed(1)}% below threshold ${minRecall * 100}%`);
  }
  if (results.summary.f1 < minF1) {
    errors.push(`F1 ${(results.summary.f1 * 100).toFixed(1)}% below threshold ${minF1 * 100}%`);
  }
  if (results.summary.falsePositives > maxFalsePositives) {
    errors.push(`False positives ${results.summary.falsePositives} exceeds max ${maxFalsePositives}`);
  }

  if (errors.length > 0) {
    throw new Error(`Benchmark thresholds not met:\n${errors.join('\n')}`);
  }
}

module.exports = {
  runPatternBenchmarks,
  runFixBenchmarks,
  generateReport,
  assertThresholds,
  extractPatternIds,
  toPascalCase
};
