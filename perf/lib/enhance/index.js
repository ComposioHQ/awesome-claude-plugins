const pluginAnalyzer = require('./plugin-analyzer');
const pluginPatterns = require('./plugin-patterns');
const toolPatterns = require('./tool-patterns');
const securityPatterns = require('./security-patterns');
const agentAnalyzer = require('./agent-analyzer');
const agentPatterns = require('./agent-patterns');
const docsAnalyzer = require('./docs-analyzer');
const docsPatterns = require('./docs-patterns');
const projectmemoryAnalyzer = require('./projectmemory-analyzer');
const projectmemoryPatterns = require('./projectmemory-patterns');
const promptAnalyzer = require('./prompt-analyzer');
const promptPatterns = require('./prompt-patterns');
const hookAnalyzer = require('./hook-analyzer');
const skillAnalyzer = require('./skill-analyzer');
const reporter = require('./reporter');
const fixer = require('./fixer');
const suppression = require('./suppression');
const autoSuppression = require('./auto-suppression');
const benchmark = require('./benchmark');

module.exports = {
  // Main analyzers
  pluginAnalyzer,
  agentAnalyzer,
  docsAnalyzer,
  projectmemoryAnalyzer,
  promptAnalyzer,
  hookAnalyzer,
  skillAnalyzer,

  // Pattern modules
  pluginPatterns,
  toolPatterns,
  securityPatterns,
  agentPatterns,
  docsPatterns,
  projectmemoryPatterns,
  promptPatterns,

  // Output modules
  reporter,
  fixer,
  suppression,
  autoSuppression,
  benchmark,

  // Convenience exports - Plugin
  analyze: pluginAnalyzer.analyze,
  analyzePlugin: pluginAnalyzer.analyzePlugin,
  analyzeAllPlugins: pluginAnalyzer.analyzeAllPlugins,
  applyFixes: pluginAnalyzer.applyFixes,
  generateReport: pluginAnalyzer.generateReport,

  // Convenience exports - Agent
  analyzeAgent: agentAnalyzer.analyzeAgent,
  analyzeAllAgents: agentAnalyzer.analyzeAllAgents,
  agentApplyFixes: agentAnalyzer.applyFixes,
  agentGenerateReport: agentAnalyzer.generateReport,

  // Convenience exports - Docs
  analyzeDoc: docsAnalyzer.analyzeDoc,
  analyzeAllDocs: docsAnalyzer.analyzeAllDocs,
  docsApplyFixes: docsAnalyzer.applyFixes,
  docsGenerateReport: docsAnalyzer.generateReport,

  // Convenience exports - Project Memory (CLAUDE.md/AGENTS.md)
  analyzeProjectMemory: projectmemoryAnalyzer.analyze,
  analyzeClaudeMd: projectmemoryAnalyzer.analyze, // Alias for familiarity
  findProjectMemoryFile: projectmemoryAnalyzer.findProjectMemoryFile,
  projectMemoryApplyFixes: projectmemoryAnalyzer.applyFixes,
  projectMemoryGenerateReport: projectmemoryAnalyzer.generateReport,

  // Convenience exports - Prompt
  analyzePrompt: promptAnalyzer.analyzePrompt,
  analyzeAllPrompts: promptAnalyzer.analyzeAllPrompts,
  promptApplyFixes: promptAnalyzer.applyFixes,
  promptGenerateReport: promptAnalyzer.generateReport,

  // Convenience exports - Hooks
  analyzeHook: hookAnalyzer.analyzeHook,
  analyzeAllHooks: hookAnalyzer.analyzeAllHooks,
  hooksAnalyze: hookAnalyzer.analyze,

  // Convenience exports - Skills
  analyzeSkill: skillAnalyzer.analyzeSkill,
  analyzeAllSkills: skillAnalyzer.analyzeAllSkills,
  skillsAnalyze: skillAnalyzer.analyze,

  // Convenience exports - Orchestrator
  generateOrchestratorReport: reporter.generateOrchestratorReport,
  deduplicateOrchestratorFindings: reporter.deduplicateOrchestratorFindings,

  // Convenience exports - Suppression
  loadSuppressionConfig: suppression.loadConfig,
  filterFindings: suppression.filterFindings,
  extractInlineSuppressions: suppression.extractInlineSuppressions,
  generateSuppressionSummary: suppression.generateSuppressionSummary,

  // Convenience exports - Auto-Suppression
  isLikelyFalsePositive: autoSuppression.isLikelyFalsePositive,
  getProjectId: autoSuppression.getProjectId,
  loadAutoSuppressions: autoSuppression.loadAutoSuppressions,
  saveAutoSuppressions: autoSuppression.saveAutoSuppressions,
  clearAutoSuppressions: autoSuppression.clearAutoSuppressions,
  mergeSuppressions: autoSuppression.mergeSuppressions,
  analyzeForAutoSuppression: autoSuppression.analyzeForAutoSuppression,
  exportAutoSuppressions: autoSuppression.exportAutoSuppressions,
  importAutoSuppressions: autoSuppression.importAutoSuppressions,

  // Convenience exports - Benchmark
  runPatternBenchmarks: benchmark.runPatternBenchmarks,
  runFixBenchmarks: benchmark.runFixBenchmarks,
  generateBenchmarkReport: benchmark.generateReport,
  assertBenchmarkThresholds: benchmark.assertThresholds
};
