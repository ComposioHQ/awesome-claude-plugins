/**
 * Slop Detection Pipeline
 *
 * 3-phase detection pipeline orchestrator:
 * - Phase 1 (built-in): regex patterns + multi-pass analyzers - always runs
 * - Phase 2 (optional): CLI tools (jscpd, madge, escomplex) - if available
 * - Phase 3 (LLM handoff): certainty-tagged findings for agent review
 *
 * Inherits modes from deslop: report (analyze only) vs apply (fix issues)
 *
 * @module patterns/pipeline
 * @author Avi Fenesh
 * @license MIT
 */

const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const slopPatterns = require('./slop-patterns');
const analyzers = require('./slop-analyzers');

// Concurrent file reads per batch
const FILE_READ_BATCH_SIZE = 50;

/**
 * Global exclusions - files that should NEVER be flagged
 * These are meta-files that define detection patterns, so they naturally
 * contain the patterns they're detecting (not actual slop)
 */
const GLOBAL_EXCLUSIONS = [
  '**/slop-patterns.js',
  '**/slop-analyzers.js',
  '**/cli-enhancers.js',
  '**/pipeline.js',
  '**/review-patterns.js',
  '**/detect.js',
  '**/*-patterns.js',  // Any pattern definition file
  '**/*-analyzers.js'  // Any analyzer definition file
];

/**
 * Certainty levels for findings
 * HIGH: Single regex match - definitive
 * MEDIUM: Multi-pass analysis - requires context
 * LOW: Heuristic/CLI tool - needs verification
 */
const CERTAINTY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

/**
 * Thoroughness levels
 * quick: Phase 1 regex only - fastest
 * normal: Phase 1 + multi-pass analyzers - balanced
 * deep: Phase 1 + Phase 2 CLI tools (if available) - thorough
 */
const THOROUGHNESS = {
  QUICK: 'quick',
  NORMAL: 'normal',
  DEEP: 'deep'
};

// Default timeout for pipeline execution (5 minutes)
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Read multiple files asynchronously in batches
 * @param {string[]} files - Array of file paths
 * @param {number} batchSize - Concurrent reads per batch
 * @returns {Promise<Map<string, {content: string|null, error: Error|null}>>}
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

/**
 * Run the slop detection pipeline
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Pipeline options
 * @param {string} [options.thoroughness='normal'] - quick | normal | deep
 * @param {string[]} [options.targetFiles] - Specific files to analyze (defaults to all source files)
 * @param {string} [options.language] - Filter to specific language
 * @param {string} [options.mode='report'] - report | apply
 * @param {Object} [options.cliTools] - Pre-detected CLI tools (from detectAvailableTools)
 * @param {number} [options.timeout] - Timeout in ms (default: 5 minutes)
 * @returns {Promise<Object>} Pipeline results: { findings, summary, phase3Prompt, missingTools }
 */
async function runPipeline(repoPath, options = {}) {
  const thoroughness = options.thoroughness || THOROUGHNESS.NORMAL;
  const mode = options.mode || 'report';
  const language = options.language || null;
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  const findings = [];
  const missingTools = [];
  let cliTools = options.cliTools || null;
  let timedOut = false;

  // Helper to check if timeout exceeded
  function isTimedOut() {
    return Date.now() - startTime > timeout;
  }

  // Get target files - limit to 200 to prevent memory exhaustion
  // Users can pass targetFiles explicitly for larger scans
  let targetFiles = options.targetFiles;
  const maxFiles = options.maxFiles || 200;
  if (!targetFiles || targetFiles.length === 0) {
    const result = analyzers.countSourceFiles(repoPath, {
      maxFiles,
      includeTests: false
    });
    targetFiles = result.files;
  }

  // Pre-load all file contents asynchronously (used by Phase 1 and Phase 1b)
  let fileContents;
  try {
    fileContents = await batchReadFiles(targetFiles);
  } catch (err) {
    console.error('[WARN] File pre-loading failed:', err.message);
    fileContents = new Map();
  }

  // Phase 1: Built-in regex patterns (always runs)
  // Wrapped in try-catch to prevent crashes on malformed files
  try {
    const phase1Results = runPhase1(repoPath, targetFiles, language, fileContents);
    findings.push(...phase1Results);
  } catch (err) {
    // Log but continue with empty phase1 results rather than crash
    console.error('[WARN] Phase 1 failed:', err.message);
  }

  // Check timeout after Phase 1
  if (isTimedOut()) {
    console.error('[WARN] Pipeline timeout after Phase 1');
    timedOut = true;
  }

  // Phase 1b: Multi-pass analyzers (if normal or deep)
  // Wrapped in try-catch as these are expensive and can fail
  if (!timedOut && thoroughness !== THOROUGHNESS.QUICK) {
    try {
      // runMultiPassAnalyzers is async to support non-blocking I/O (PERF-007)
      const multiPassResults = await runMultiPassAnalyzers(repoPath, targetFiles, fileContents);
      findings.push(...multiPassResults);
    } catch (err) {
      // Log but continue with partial results rather than crash
      console.error('[WARN] Phase 1b failed:', err.message);
    }

    // Check timeout after Phase 1b
    if (isTimedOut()) {
      console.error('[WARN] Pipeline timeout after Phase 1b');
      timedOut = true;
    }
  }

  // Phase 2: CLI tools (only if deep and tools available)
  // Detect project languages for language-aware tool recommendations
  let detectedLanguages = [];
  if (!timedOut && thoroughness === THOROUGHNESS.DEEP) {
    // Lazy-load CLI enhancers to avoid circular dependencies
    const cliEnhancers = require('./cli-enhancers');

    // Detect project languages
    detectedLanguages = cliEnhancers.detectProjectLanguages(repoPath);

    if (!cliTools) {
      // Get tools relevant for detected languages
      cliTools = cliEnhancers.detectAvailableTools(detectedLanguages);
    }

    // Track missing tools (only those relevant for project languages)
    const relevantTools = cliEnhancers.getToolsForLanguages(detectedLanguages);
    for (const toolName of Object.keys(relevantTools)) {
      if (!cliTools[toolName]) {
        missingTools.push(toolName);
      }
    }

    const phase2Results = runPhase2(repoPath, cliTools, targetFiles);
    findings.push(...phase2Results);
  }

  // Build summary
  const summary = buildSummary(findings);

  // Generate Phase 3 handoff prompt
  const phase3Prompt = formatHandoffPrompt(findings, mode);

  return {
    findings,
    summary,
    phase3Prompt,
    missingTools,
    detectedLanguages,
    metadata: {
      repoPath,
      thoroughness,
      mode,
      filesAnalyzed: targetFiles.length,
      timestamp: new Date().toISOString(),
      timedOut,
      elapsedMs: Date.now() - startTime
    }
  };
}

/**
 * Phase 1: Run built-in regex patterns against target files
 *
 * @param {string} repoPath - Repository root
 * @param {string[]} targetFiles - Files to analyze
 * @param {string|null} language - Optional language filter
 * @param {Map<string, {content: string|null, error: Error|null}>} [fileContents] - Pre-loaded file contents (optional)
 * @returns {Array} Findings with HIGH certainty
 */
function runPhase1(repoPath, targetFiles, language, fileContents) {
  const findings = [];
  const contentMap = fileContents || new Map();

  // Get patterns (filtered by language if specified)
  const patterns = language
    ? slopPatterns.getPatternsForLanguage(language)
    : slopPatterns.slopPatterns;

  for (const file of targetFiles) {
    // Skip globally excluded files (pattern definition files)
    if (slopPatterns.isFileExcluded(file, GLOBAL_EXCLUSIONS)) {
      continue;
    }

    // Detect file language once per file
    const fileLanguage = analyzers.detectLanguage(file);

    // Skip if language filter doesn't match file extension
    if (language) {
      // For JS/TS language filter, accept both 'javascript' and 'js' detection results
      const isJsFamily = (language === 'javascript' || language === 'typescript') && fileLanguage === 'js';
      if (fileLanguage !== language && !isJsFamily) continue;
    }

    // Get pre-loaded content from map, fallback to synchronous read
    const filePath = path.isAbsolute(file) ? file : path.join(repoPath, file);
    const readResult = contentMap.get(file) || contentMap.get(filePath);

    let content;
    if (readResult && !readResult.error && readResult.content !== null) {
      content = readResult.content;
    } else {
      // Fallback to synchronous read (for backward compatibility with direct calls)
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue; // Skip unreadable files
      }
    }

    const lines = content.split('\n');

    for (const [patternName, pattern] of Object.entries(patterns)) {
      // Skip multi-pass patterns (handled separately)
      if (pattern.requiresMultiPass) continue;

      // Skip if no regex pattern
      if (!pattern.pattern) continue;

      // Skip if file matches exclude patterns
      if (slopPatterns.isFileExcluded(file, pattern.exclude)) continue;

      // Skip language-specific patterns that don't match file's language
      if (pattern.language) {
        const patternLang = pattern.language;
        // Map detection results to pattern language names
        // Note: 'js' from detectLanguage covers both JavaScript and TypeScript
        const langMatch = (patternLang === 'javascript' && fileLanguage === 'js') ||
                          (patternLang === 'python' && fileLanguage === 'python') ||
                          (patternLang === 'rust' && fileLanguage === 'rust') ||
                          (patternLang === 'go' && fileLanguage === 'go') ||
                          (patternLang === 'java' && fileLanguage === 'java') ||
                          patternLang === fileLanguage;  // Direct match fallback
        if (!langMatch) continue;
      }

      // Handle patterns requiring consecutive line blocks
      if (pattern.minConsecutiveLines) {
        const minLines = pattern.minConsecutiveLines;
        let consecutiveStart = -1;
        let consecutiveCount = 0;

        for (let i = 0; i <= lines.length; i++) {
          const line = i < lines.length ? lines[i] : ''; // Empty line at end to flush
          const matches = i < lines.length && pattern.pattern.test(line);

          if (matches) {
            if (consecutiveStart === -1) {
              consecutiveStart = i;
            }
            consecutiveCount++;
          } else {
            // End of consecutive block - check if it meets threshold
            if (consecutiveCount >= minLines) {
              findings.push({
                file,
                line: consecutiveStart + 1,
                patternName,
                severity: pattern.severity,
                certainty: CERTAINTY.HIGH,
                description: `${pattern.description} (${consecutiveCount} consecutive lines)`,
                autoFix: pattern.autoFix,
                content: `Lines ${consecutiveStart + 1}-${consecutiveStart + consecutiveCount}`,
                phase: 1,
                details: { startLine: consecutiveStart + 1, endLine: consecutiveStart + consecutiveCount, lineCount: consecutiveCount }
              });
            }
            consecutiveStart = -1;
            consecutiveCount = 0;
          }
        }
      } else {
        // Standard per-line matching
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (pattern.pattern.test(line)) {
            findings.push({
              file,
              line: i + 1,
              patternName,
              severity: pattern.severity,
              certainty: CERTAINTY.HIGH,
              description: pattern.description,
              autoFix: pattern.autoFix,
              content: line.trim().substring(0, 100),
              phase: 1
            });
          }
        }
      }
    }
  }

  return findings;
}

/**
 * Run multi-pass analyzers (doc/code ratio, verbosity, etc.)
 *
 * @param {string} repoPath - Repository root
 * @param {string[]} targetFiles - Files to analyze
 * @param {Map<string, {content: string|null, error: Error|null}>} [fileContents] - Pre-loaded file contents (optional)
 * @returns {Promise<Array>} Findings with MEDIUM certainty
 */
async function runMultiPassAnalyzers(repoPath, targetFiles, fileContents) {
  const findings = [];
  const contentMap = fileContents || new Map();

  // Skip expensive analyzers for large file sets to prevent memory exhaustion
  const isLargeRepo = targetFiles.length > 100;

  // Get multi-pass pattern definitions for thresholds
  const multiPassPatterns = slopPatterns.getMultiPassPatterns();

  // Supported languages for doc/code and verbosity analysis
  const docCodeLangs = /\.(js|jsx|ts|tsx|mjs|cjs|py|rs|java|go)$/i;

  for (const file of targetFiles) {
    if (!file.match(docCodeLangs)) continue;
    if (analyzers.isTestFile(file)) continue;
    // Skip globally excluded files (pattern definition files)
    if (slopPatterns.isFileExcluded(file, GLOBAL_EXCLUSIONS)) continue;

    // Get pre-loaded content from map, fallback to synchronous read
    const filePath = path.isAbsolute(file) ? file : path.join(repoPath, file);
    const readResult = contentMap.get(file) || contentMap.get(filePath);

    let content;
    if (readResult && !readResult.error && readResult.content !== null) {
      content = readResult.content;
    } else {
      // Fallback to synchronous read (for backward compatibility with direct calls)
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
    }

    // Doc/code ratio analysis (multi-language)
    const docCodePattern = multiPassPatterns.doc_code_ratio_js;
    if (docCodePattern) {
      const docRatioViolations = analyzers.analyzeDocCodeRatio(content, {
        minFunctionLines: docCodePattern.minFunctionLines || 3,
        maxRatio: docCodePattern.maxRatio || 3.0,
        filePath: file
      });

      for (const v of docRatioViolations) {
        findings.push({
          file,
          line: v.line,
          patternName: 'doc_code_ratio',
          severity: docCodePattern.severity,
          certainty: CERTAINTY.MEDIUM,
          description: `${docCodePattern.description} (${v.docLines} doc lines / ${v.codeLines} code lines = ${v.ratio}x)`,
          autoFix: docCodePattern.autoFix,
          content: v.functionName ? `${v.functionName}()` : `Function at line ${v.line}`,
          phase: 1,
          details: { docLines: v.docLines, codeLines: v.codeLines, ratio: v.ratio, functionName: v.functionName }
        });
      }
    }

    // Verbosity ratio analysis (multi-language)
    const verbosityPattern = multiPassPatterns.verbosity_ratio;
    if (verbosityPattern) {
      const verbosityViolations = analyzers.analyzeVerbosityRatio(content, {
        minCodeLines: verbosityPattern.minCodeLines || 3,
        maxCommentRatio: verbosityPattern.maxCommentRatio || 2.0,
        filePath: file
      });

      for (const v of verbosityViolations) {
        findings.push({
          file,
          line: v.line,
          patternName: 'verbosity_ratio',
          severity: verbosityPattern.severity,
          certainty: CERTAINTY.MEDIUM,
          description: `${verbosityPattern.description} (${v.commentLines} comment lines / ${v.codeLines} code lines = ${v.ratio}x)`,
          autoFix: verbosityPattern.autoFix,
          content: `Function at line ${v.line}`,
          phase: 1,
          details: { commentLines: v.commentLines, codeLines: v.codeLines, ratio: v.ratio }
        });
      }
    }
  }

  // Project-level analyzers (run once, not per-file)
  // Wrap in try-catch to prevent crashes
  const overEngPattern = multiPassPatterns.over_engineering_metrics;
  if (overEngPattern && !isLargeRepo) {
    try {
      // analyzeOverEngineering is async to avoid blocking I/O (PERF-007)
      const overEngResult = await analyzers.analyzeOverEngineering(repoPath, {
        fileRatioThreshold: overEngPattern.fileRatioThreshold || 20,
        linesPerExportThreshold: overEngPattern.linesPerExportThreshold || 500,
        depthThreshold: overEngPattern.depthThreshold || 4
      });

      for (const v of overEngResult.violations) {
        findings.push({
          file: 'project-level',
          line: 0,
          patternName: 'over_engineering_metrics',
          severity: v.severity,
          certainty: CERTAINTY.MEDIUM,
          description: `Over-engineering: ${v.type} - ${v.value} (threshold: ${v.threshold})`,
          autoFix: 'flag',
          content: v.value,
          phase: 1,
          details: v.details
        });
      }
    } catch (err) {
      // Skip on error - don't crash the pipeline
    }
  }

  // Buzzword inflation analysis - EXPENSIVE: reads files multiple times
  // Skip for large repos to prevent memory exhaustion
  const buzzwordPattern = multiPassPatterns.buzzword_inflation;
  if (buzzwordPattern && !isLargeRepo) {
    try {
      const buzzwordResult = analyzers.analyzeBuzzwordInflation(repoPath, {
        minEvidenceMatches: buzzwordPattern.minEvidenceMatches || 2
      });

      for (const v of buzzwordResult.violations) {
        findings.push({
          file: v.file,
          line: v.line,
          patternName: 'buzzword_inflation',
          severity: v.severity,
          certainty: CERTAINTY.MEDIUM,
          description: v.message,
          autoFix: 'flag',
          content: v.claim,
          phase: 1,
          details: { buzzword: v.buzzword, category: v.category, evidenceCount: v.evidenceCount }
        });
      }
    } catch (err) {
      // Skip on error - don't crash the pipeline
    }
  }

  // Infrastructure without implementation - EXPENSIVE: reads all files twice
  // Skip for large repos to prevent memory exhaustion
  const infraPattern = multiPassPatterns.infrastructure_without_implementation;
  if (infraPattern && !isLargeRepo) {
    try {
      const infraResult = analyzers.analyzeInfrastructureWithoutImplementation(repoPath);

      for (const v of infraResult.violations) {
        findings.push({
          file: v.file,
          line: v.line,
          patternName: 'infrastructure_without_implementation',
          severity: v.severity,
          certainty: CERTAINTY.MEDIUM,
          description: v.message,
          autoFix: 'flag',
          content: v.content,
          phase: 1,
          details: { varName: v.varName, type: v.type }
        });
      }
    } catch (err) {
      // Skip on error - don't crash the pipeline
    }
  }

  // Dead code analysis (per-file)
  const deadCodePattern = multiPassPatterns.dead_code;
  if (deadCodePattern) {
    for (const file of targetFiles) {
      // Skip test files
      if (analyzers.isTestFile(file)) continue;
      // Skip globally excluded files (pattern definition files)
      if (slopPatterns.isFileExcluded(file, GLOBAL_EXCLUSIONS)) continue;

      // Get pre-loaded content from map, fallback to synchronous read
      const filePath = path.isAbsolute(file) ? file : path.join(repoPath, file);
      const readResult = contentMap.get(file) || contentMap.get(filePath);

      let content;
      if (readResult && !readResult.error && readResult.content !== null) {
        content = readResult.content;
      } else {
        // Fallback to synchronous read (for backward compatibility with direct calls)
        try {
          content = fs.readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }
      }

      const deadCodeViolations = analyzers.analyzeDeadCode(content, { filePath: file });

      for (const v of deadCodeViolations) {
        findings.push({
          file,
          line: v.line,
          patternName: 'dead_code',
          severity: deadCodePattern.severity,
          certainty: CERTAINTY.MEDIUM,
          description: `${deadCodePattern.description}: ${v.terminationType} at line ${v.terminationLine}`,
          autoFix: deadCodePattern.autoFix,
          content: v.content,
          phase: 1,
          details: { terminationType: v.terminationType, terminationLine: v.terminationLine }
        });
      }
    }
  }

  // Stub function analysis (per-file, multi-language)
  const stubPattern = multiPassPatterns.placeholder_stub_returns_js;
  if (stubPattern) {
    // Supported extensions for stub detection
    const stubExtensions = /\.(js|jsx|ts|tsx|mjs|cjs|py|rs|java|go)$/i;

    for (const file of targetFiles) {
      if (analyzers.isTestFile(file)) continue;
      if (!file.match(stubExtensions)) continue;
      // Honor pattern exclude globs (e.g., *.config.*)
      if (slopPatterns.isFileExcluded(file, stubPattern.exclude)) continue;

      // Get pre-loaded content from map, fallback to synchronous read
      const filePath = path.isAbsolute(file) ? file : path.join(repoPath, file);
      const readResult = contentMap.get(file) || contentMap.get(filePath);

      let content;
      if (readResult && !readResult.error && readResult.content !== null) {
        content = readResult.content;
      } else {
        // Fallback to synchronous read (for backward compatibility with direct calls)
        try {
          content = fs.readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }
      }

      const stubViolations = analyzers.analyzeStubFunctions(content, { filePath: file });

      for (const v of stubViolations) {
        findings.push({
          file,
          line: v.line,
          patternName: 'placeholder_stub_returns',
          severity: v.hasTodo ? 'high' : stubPattern.severity,
          certainty: v.certainty,
          description: `${stubPattern.description}: ${v.functionName}() returns ${v.returnValue}`,
          autoFix: stubPattern.autoFix,
          content: v.content,
          phase: 1,
          details: { functionName: v.functionName, returnValue: v.returnValue, hasTodo: v.hasTodo }
        });
      }
    }
  }

  // Shotgun surgery analysis (git history) - can have large buffer issues
  // Skip for large repos to prevent memory exhaustion
  const shotgunPattern = multiPassPatterns.shotgun_surgery;
  if (shotgunPattern && !isLargeRepo) {
    try {
      const shotgunResult = analyzers.analyzeShotgunSurgery(repoPath, {
        commitLimit: Math.min(shotgunPattern.commitLimit || 100, 50), // Reduce commit limit
        clusterThreshold: shotgunPattern.clusterThreshold || 5
      });

      for (const v of shotgunResult.violations) {
        findings.push({
          file: 'project-level',
          line: 0,
          patternName: 'shotgun_surgery',
          severity: shotgunPattern.severity,
          certainty: CERTAINTY.MEDIUM,
          description: `${shotgunPattern.description}: ${v.files.length} files change together ${v.count} times`,
          autoFix: shotgunPattern.autoFix,
          content: v.files.join(', ').substring(0, 100),
          phase: 1,
          details: { files: v.files, changeCount: v.count }
        });
      }
    } catch {
      // Git not available or not a git repo - skip silently
    }
  }

  return findings;
}

/**
 * Phase 2: Run CLI tools (if available)
 *
 * @param {string} repoPath - Repository root
 * @param {Object} cliTools - Available CLI tools { jscpd, madge, escomplex }
 * @param {string[]} targetFiles - Files to analyze
 * @returns {Array} Findings with LOW certainty
 */
function runPhase2(repoPath, cliTools, targetFiles) {
  const findings = [];
  const cliEnhancers = require('./cli-enhancers');

  // Duplicate detection with jscpd
  if (cliTools.jscpd) {
    const duplicates = cliEnhancers.runDuplicateDetection(repoPath);
    if (duplicates) {
      for (const dup of duplicates) {
        findings.push({
          file: dup.firstFile,
          line: dup.firstLine,
          patternName: 'code_duplication',
          severity: 'medium',
          certainty: CERTAINTY.LOW,
          description: `Code duplication: ${dup.lines} lines duplicated in ${dup.secondFile}:${dup.secondLine}`,
          autoFix: 'flag',
          content: `${dup.lines} lines duplicated`,
          phase: 2,
          details: dup
        });
      }
    }
  }

  // Circular dependencies with madge
  if (cliTools.madge) {
    const circularDeps = cliEnhancers.runDependencyAnalysis(repoPath);
    if (circularDeps) {
      for (const cycle of circularDeps) {
        findings.push({
          file: cycle[0],
          line: 0,
          patternName: 'circular_dependency',
          severity: 'high',
          certainty: CERTAINTY.LOW,
          description: `Circular dependency: ${cycle.join(' -> ')}`,
          autoFix: 'flag',
          content: cycle.join(' -> '),
          phase: 2,
          details: { cycle }
        });
      }
    }
  }

  // Complexity analysis with escomplex
  if (cliTools.escomplex) {
    const complexityResults = cliEnhancers.runComplexityAnalysis(repoPath, targetFiles);
    if (complexityResults) {
      for (const result of complexityResults) {
        if (result.complexity > 10) { // High cyclomatic complexity threshold
          findings.push({
            file: result.file,
            line: result.line || 0,
            patternName: 'high_complexity',
            severity: result.complexity > 20 ? 'high' : 'medium',
            certainty: CERTAINTY.LOW,
            description: `High cyclomatic complexity: ${result.complexity} in ${result.name}`,
            autoFix: 'flag',
            content: `${result.name}: complexity ${result.complexity}`,
            phase: 2,
            details: result
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Build summary statistics from findings
 *
 * @param {Array} findings - All findings
 * @returns {Object} Summary statistics
 */
function buildSummary(findings) {
  const summary = {
    total: findings.length,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byCertainty: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    byPhase: { 1: 0, 2: 0 },
    byAutoFix: { remove: 0, replace: 0, add_logging: 0, flag: 0, none: 0 },
    topPatterns: {}
  };

  for (const f of findings) {
    summary.bySeverity[f.severity] = (summary.bySeverity[f.severity] || 0) + 1;
    summary.byCertainty[f.certainty] = (summary.byCertainty[f.certainty] || 0) + 1;
    summary.byPhase[f.phase] = (summary.byPhase[f.phase] || 0) + 1;
    summary.byAutoFix[f.autoFix] = (summary.byAutoFix[f.autoFix] || 0) + 1;
    summary.topPatterns[f.patternName] = (summary.topPatterns[f.patternName] || 0) + 1;
  }

  return summary;
}

/**
 * Format handoff prompt for LLM (Phase 3)
 *
 * Creates a token-efficient prompt for the agent to review findings.
 * Groups by certainty level with action guidance:
 * - HIGH: Apply directly (if apply mode)
 * - MEDIUM: Verify context before applying
 * - LOW: Use judgment, may be false positive
 *
 * @param {Array} findings - All findings
 * @param {string} mode - report | apply
 * @param {Object} options - Formatting options
 * @param {boolean} options.compact - Use compact table format (60-70% fewer tokens)
 * @param {number} options.maxFindings - Maximum findings to include (default: 50)
 * @returns {string} Formatted prompt
 */
function formatHandoffPrompt(findings, mode, options = {}) {
  const { compact = false, maxFindings = 50 } = options;

  if (findings.length === 0) {
    return '## Slop Detection Results\n\nNo issues detected.';
  }

  // Use compact format if requested
  if (compact) {
    return formatCompactPrompt(findings, mode, maxFindings);
  }

  // Group findings by certainty
  const byGroup = {
    HIGH: findings.filter(f => f.certainty === CERTAINTY.HIGH),
    MEDIUM: findings.filter(f => f.certainty === CERTAINTY.MEDIUM),
    LOW: findings.filter(f => f.certainty === CERTAINTY.LOW)
  };

  let prompt = '## Slop Detection Results\n\n';
  prompt += `Mode: **${mode}** | Total: ${findings.length} findings\n\n`;

  // HIGH certainty - definitive matches
  if (byGroup.HIGH.length > 0) {
    prompt += '### HIGH Certainty (Definitive - trust these)\n\n';
    if (mode === 'apply') {
      prompt += '_Action: Apply fixes directly for autoFix patterns._\n\n';
    }
    prompt += formatFindingsList(byGroup.HIGH);
    prompt += '\n';
  }

  // MEDIUM certainty - needs context verification
  if (byGroup.MEDIUM.length > 0) {
    prompt += '### MEDIUM Certainty (Verify context)\n\n';
    prompt += '_Action: Review surrounding code before applying._\n\n';
    prompt += formatFindingsList(byGroup.MEDIUM);
    prompt += '\n';
  }

  // LOW certainty - use judgment
  if (byGroup.LOW.length > 0) {
    prompt += '### LOW Certainty (Use judgment)\n\n';
    prompt += '_Action: May be false positives. Investigate before acting._\n\n';
    prompt += formatFindingsList(byGroup.LOW);
    prompt += '\n';
  }

  // Action summary
  prompt += '### Action Summary\n\n';
  const autoFixable = findings.filter(f => f.autoFix && f.autoFix !== 'flag' && f.autoFix !== 'none');
  const needsReview = findings.filter(f => f.autoFix === 'flag' || f.autoFix === 'none');

  prompt += `- Auto-fixable: ${autoFixable.length}\n`;
  prompt += `- Needs manual review: ${needsReview.length}\n`;

  return prompt;
}

/**
 * Format findings in compact table format for token efficiency
 *
 * Reduces token usage by ~60-70% compared to verbose format.
 * Best for large finding sets where full descriptions aren't needed.
 *
 * @param {Array} findings - All findings
 * @param {string} mode - report | apply
 * @param {number} maxFindings - Maximum findings to include
 * @returns {string} Compact formatted prompt
 */
function formatCompactPrompt(findings, mode, maxFindings) {
  // Single pass to count certainty levels and auto-fixable findings
  const { highCount, mediumCount, lowCount, autoFixableCount } = findings.reduce((acc, f) => {
    switch (f.certainty) {
      case CERTAINTY.HIGH: acc.highCount++; break;
      case CERTAINTY.MEDIUM: acc.mediumCount++; break;
      case CERTAINTY.LOW: acc.lowCount++; break;
    }
    if (f.autoFix && f.autoFix !== 'flag' && f.autoFix !== 'none') {
      acc.autoFixableCount++;
    }
    return acc;
  }, { highCount: 0, mediumCount: 0, lowCount: 0, autoFixableCount: 0 });

  // Truncate if needed
  const limited = findings.slice(0, maxFindings);
  const truncated = findings.length > maxFindings;

  // Summary header
  let output = `## Slop: ${mode}|H:${highCount}|M:${mediumCount}|L:${lowCount}\n\n`;

  // Table format
  output += '|File|L|Pattern|Cert|Fix|\n';
  output += '|---|---|---|---|---|\n';

  for (const f of limited) {
    const fix = f.autoFix && f.autoFix !== 'flag' && f.autoFix !== 'none' ? f.autoFix : '-';
    const cert = f.certainty.charAt(0); // H, M, or L
    output += `|${f.file}|${f.line}|${f.patternName}|${cert}|${fix}|\n`;
  }

  if (truncated) {
    output += `\n_+${findings.length - maxFindings} more findings (truncated)_\n`;
  }

  // Auto-fix summary
  output += `\n**Auto-fixable: ${autoFixableCount}** | Manual: ${findings.length - autoFixableCount}`;

  return output;
}

/**
 * Format a list of findings for the prompt
 *
 * @param {Array} findings - Findings to format
 * @returns {string} Formatted list
 */
function formatFindingsList(findings) {
  // Group by file for compact output
  const byFile = {};
  for (const f of findings) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  let output = '';
  for (const [file, fileFindings] of Object.entries(byFile)) {
    output += `**${file}**\n`;
    for (const f of fileFindings) {
      const fixTag = f.autoFix && f.autoFix !== 'flag' && f.autoFix !== 'none'
        ? ` [${f.autoFix}]`
        : '';
      output += `- L${f.line}: ${f.description}${fixTag}\n`;
    }
    output += '\n';
  }

  return output;
}

module.exports = {
  runPipeline,
  // Exported for testing
  runPhase1,
  runMultiPassAnalyzers,
  runPhase2,
  buildSummary,
  formatHandoffPrompt,
  formatCompactPrompt,
  // Constants
  CERTAINTY,
  THOROUGHNESS
};
