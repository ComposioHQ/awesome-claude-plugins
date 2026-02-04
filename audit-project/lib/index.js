/**
 * Awesome-Slash Core Library
 *
 * Unified entry point for all core library modules.
 * Provides platform detection, pattern matching, workflow state management,
 * configuration management, and context optimization utilities.
 *
 * @module awesome-slash/lib
 * @author Avi Fenesh
 * @license MIT
 */

const detectPlatform = require('./platform/detect-platform');
const verifyTools = require('./platform/verify-tools');
const reviewPatterns = require('./patterns/review-patterns');
const slopPatterns = require('./patterns/slop-patterns');
const pipeline = require('./patterns/pipeline');
const cliEnhancers = require('./patterns/cli-enhancers');
const workflowState = require('./state/workflow-state');
const contextOptimizer = require('./utils/context-optimizer');
const shellEscape = require('./utils/shell-escape');
const config = require('./config');
const sourceCache = require('./sources/source-cache');
const customHandler = require('./sources/custom-handler');
const policyQuestions = require('./sources/policy-questions');
const crossPlatform = require('./cross-platform');
const enhance = require('./enhance');
const repoMap = require('./repo-map');
const perf = require('./perf');
const collectors = require('./collectors');

/**
 * Platform detection and verification utilities
 */
const platform = {
  /**
   * Detect project platform configuration
   * @see module:platform/detect-platform
   */
  detect: detectPlatform.detect,
  detectAsync: detectPlatform.detectAsync,
  detectCI: detectPlatform.detectCI,
  detectDeployment: detectPlatform.detectDeployment,
  detectProjectType: detectPlatform.detectProjectType,
  detectPackageManager: detectPlatform.detectPackageManager,
  detectBranchStrategy: detectPlatform.detectBranchStrategy,
  detectMainBranch: detectPlatform.detectMainBranch,
  invalidateCache: detectPlatform.invalidateCache,

  /**
   * Verify tool availability
   * @see module:platform/verify-tools
   */
  verifyTools: verifyTools.verify,
  verifyToolsAsync: verifyTools.verifyAsync,
  checkTool: verifyTools.checkTool,
  checkToolAsync: verifyTools.checkToolAsync,
  TOOL_DEFINITIONS: verifyTools.TOOL_DEFINITIONS
};

/**
 * Code pattern matching utilities
 */
const patterns = {
  /**
   * Review patterns for code quality analysis
   * @see module:patterns/review-patterns
   */
  review: reviewPatterns,

  /**
   * Slop patterns for AI-generated code detection
   * @see module:patterns/slop-patterns
   */
  slop: slopPatterns,

  /**
   * Slop detection pipeline orchestrator
   * @see module:patterns/pipeline
   */
  pipeline: {
    runPipeline: pipeline.runPipeline,
    CERTAINTY: pipeline.CERTAINTY,
    THOROUGHNESS: pipeline.THOROUGHNESS,
    formatHandoffPrompt: pipeline.formatHandoffPrompt,
    buildSummary: pipeline.buildSummary
  },

  /**
   * Optional CLI tool enhancers for deep analysis
   * @see module:patterns/cli-enhancers
   */
  cliEnhancers: {
    detectAvailableTools: cliEnhancers.detectAvailableTools,
    runDuplicateDetection: cliEnhancers.runDuplicateDetection,
    runDependencyAnalysis: cliEnhancers.runDependencyAnalysis,
    runComplexityAnalysis: cliEnhancers.runComplexityAnalysis,
    getMissingToolsMessage: cliEnhancers.getMissingToolsMessage,
    CLI_TOOLS: cliEnhancers.CLI_TOOLS
  }
};

/**
 * Workflow state management
 * @see module:state/workflow-state
 */
const state = {
  // Constants
  SCHEMA_VERSION: workflowState.SCHEMA_VERSION,
  PHASES: workflowState.PHASES,
  DEFAULT_POLICY: workflowState.DEFAULT_POLICY,

  // Core functions
  generateWorkflowId: workflowState.generateWorkflowId,
  getStatePath: workflowState.getStatePath,
  ensureStateDir: workflowState.ensureStateDir,
  validateStateSchema: workflowState.validateStateSchema,

  // CRUD operations
  createState: workflowState.createState,
  readState: workflowState.readState,
  writeState: workflowState.writeState,
  updateState: workflowState.updateState,
  deleteState: workflowState.deleteState,

  // Phase management
  startPhase: workflowState.startPhase,
  completePhase: workflowState.completePhase,
  failPhase: workflowState.failPhase,
  skipToPhase: workflowState.skipToPhase,

  // Workflow lifecycle
  completeWorkflow: workflowState.completeWorkflow,
  abortWorkflow: workflowState.abortWorkflow,
  hasActiveWorkflow: workflowState.hasActiveWorkflow,
  getWorkflowSummary: workflowState.getWorkflowSummary,

  // Agent management
  updateAgentResult: workflowState.updateAgentResult,
  incrementIteration: workflowState.incrementIteration
};

/**
 * Git command optimization and string escaping utilities
 * @see module:utils/context-optimizer
 * @see module:utils/shell-escape
 */
const utils = {
  contextOptimizer,
  shellEscape
};

/**
 * Task source management
 * @see module:sources/source-cache
 * @see module:sources/custom-handler
 * @see module:sources/policy-questions
 */
const sources = {
  // Main entry point - returns ready-to-use question structure
  getPolicyQuestions: policyQuestions.getPolicyQuestions,
  getCustomTypeQuestions: policyQuestions.getCustomTypeQuestions,
  getCustomNameQuestion: policyQuestions.getCustomNameQuestion,
  parseAndCachePolicy: policyQuestions.parseAndCachePolicy,
  isUsingCached: policyQuestions.isUsingCached,
  needsCustomFollowUp: policyQuestions.needsCustomFollowUp,
  needsOtherDescription: policyQuestions.needsOtherDescription,

  // Cache operations (direct access if needed)
  getPreference: sourceCache.getPreference,
  savePreference: sourceCache.savePreference,
  getToolCapabilities: sourceCache.getToolCapabilities,
  saveToolCapabilities: sourceCache.saveToolCapabilities,
  clearCache: sourceCache.clearCache,

  // Custom source handling (direct access if needed)
  SOURCE_TYPES: customHandler.SOURCE_TYPES,
  probeCLI: customHandler.probeCLI,
  buildCustomConfig: customHandler.buildCustomConfig
};

/**
 * Cross-platform utilities for Claude Code, OpenCode, and Codex CLI
 * @see module:cross-platform
 */
const xplat = {
  // Platform detection
  PLATFORMS: crossPlatform.PLATFORMS,
  STATE_DIRS: crossPlatform.STATE_DIRS,
  getStateDir: crossPlatform.getStateDir,
  detectPlatform: crossPlatform.detectPlatform,

  // Tool schema helpers
  TOOL_SCHEMA_GUIDELINES: crossPlatform.TOOL_SCHEMA_GUIDELINES,
  createToolDefinition: crossPlatform.createToolDefinition,

  // Response helpers (MCP-compatible)
  successResponse: crossPlatform.successResponse,
  errorResponse: crossPlatform.errorResponse,
  unknownToolResponse: crossPlatform.unknownToolResponse,

  // Prompt formatting
  formatBlock: crossPlatform.formatBlock,
  formatList: crossPlatform.formatList,
  formatSection: crossPlatform.formatSection,

  // Token efficiency
  truncate: crossPlatform.truncate,
  compactSummary: crossPlatform.compactSummary,

  // Agent prompts
  AGENT_TEMPLATE: crossPlatform.AGENT_TEMPLATE,
  createAgentPrompt: crossPlatform.createAgentPrompt,

  // Platform configs
  getOpenCodeConfig: crossPlatform.getOpenCodeConfig,
  getCodexConfig: crossPlatform.getCodexConfig,
  getInstructionFiles: crossPlatform.getInstructionFiles,
  INSTRUCTION_FILES: crossPlatform.INSTRUCTION_FILES
};

// Main exports
module.exports = {
  platform,
  patterns,
  state,
  utils,
  config,
  sources,
  xplat,
  enhance,
  repoMap,
  perf,
  collectors,

  // Direct module access for backward compatibility
  detectPlatform,
  verifyTools,
  reviewPatterns,
  slopPatterns,
  pipeline,
  cliEnhancers,
  workflowState,
  contextOptimizer,
  shellEscape,
  sourceCache,
  customHandler,
  policyQuestions,
  crossPlatform
};
