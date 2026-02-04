/**
 * Simplified workflow state management
 *
 * Two files:
 * - Main project: {stateDir}/tasks.json (tracks active worktree/task)
 * - Worktree: {stateDir}/flow.json (tracks workflow progress)
 *
 * State directory is platform-aware:
 * - Claude Code: .claude/
 * - OpenCode: .opencode/
 * - Codex CLI: .codex/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getStateDir } = require('../platform/state-dir');
const { writeJsonAtomic } = require('../utils/atomic-write');

// File paths
const TASKS_FILE = 'tasks.json';
const FLOW_FILE = 'flow.json';

/**
 * Validate and resolve path to prevent path traversal attacks
 * @param {string} basePath - Base directory path
 * @returns {string} Validated absolute path
 * @throws {Error} If path is invalid
 */
function validatePath(basePath) {
  if (typeof basePath !== 'string' || basePath.length === 0) {
    throw new Error('Path must be a non-empty string');
  }
  const resolved = path.resolve(basePath);
  if (resolved.includes('\0')) {
    throw new Error('Path contains invalid null byte');
  }
  return resolved;
}

/**
 * Validate that target path is within base directory
 * @param {string} targetPath - Target file path
 * @param {string} basePath - Base directory
 * @throws {Error} If path traversal detected
 */
function validatePathWithinBase(targetPath, basePath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(basePath);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error('Path traversal detected');
  }
}

/**
 * Generate a unique workflow ID
 * @returns {string} Workflow ID
 */
function generateWorkflowId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const random = crypto.randomBytes(4).toString('hex');
  return `workflow-${date}-${time}-${random}`;
}

// Valid phases for the workflow
const PHASES = [
  'policy-selection',
  'task-discovery',
  'worktree-setup',
  'exploration',
  'planning',
  'user-approval',
  'implementation',
  'review-loop',
  'delivery-validation',
  'shipping',
  'complete'
];

/**
 * Ensure state directory exists (platform-aware)
 */
function ensureStateDir(basePath) {
  const stateDir = path.join(basePath, getStateDir(basePath));
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

// =============================================================================
// TASKS.JSON - Main project directory
// =============================================================================

/**
 * Get path to tasks.json with validation
 */
function getTasksPath(projectPath = process.cwd()) {
  const validatedBase = validatePath(projectPath);
  const tasksPath = path.join(validatedBase, getStateDir(projectPath), TASKS_FILE);
  validatePathWithinBase(tasksPath, validatedBase);
  return tasksPath;
}

/**
 * Read tasks.json from main project
 * Returns { active: null } if file doesn't exist or is corrupted
 * Logs critical error on corruption to prevent silent data loss
 */
function readTasks(projectPath = process.cwd()) {
  const tasksPath = getTasksPath(projectPath);
  if (!fs.existsSync(tasksPath)) {
    return { active: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    // Normalize legacy format that may not have 'active' field
    if (!Object.prototype.hasOwnProperty.call(data, 'active')) {
      return { active: null };
    }
    return data;
  } catch (e) {
    console.error(`[CRITICAL] Corrupted tasks.json at ${tasksPath}: ${e.message}`);
    return { active: null };
  }
}

/**
 * Write tasks.json to main project
 */
function writeTasks(tasks, projectPath = process.cwd()) {
  ensureStateDir(projectPath);
  const tasksPath = getTasksPath(projectPath);
  writeJsonAtomic(tasksPath, tasks);
  return true;
}

/**
 * Set active task in main project
 */
function setActiveTask(task, projectPath = process.cwd()) {
  const tasks = readTasks(projectPath);
  tasks.active = {
    ...task,
    startedAt: new Date().toISOString()
  };
  return writeTasks(tasks, projectPath);
}

/**
 * Clear active task
 */
function clearActiveTask(projectPath = process.cwd()) {
  const tasks = readTasks(projectPath);
  tasks.active = null;
  return writeTasks(tasks, projectPath);
}

/**
 * Check if there's an active task
 * Uses != null to catch both null and undefined (legacy format safety)
 */
function hasActiveTask(projectPath = process.cwd()) {
  const tasks = readTasks(projectPath);
  return tasks.active != null;
}

// =============================================================================
// FLOW.JSON - Worktree directory
// =============================================================================

/**
 * Get path to flow.json with validation
 */
function getFlowPath(worktreePath = process.cwd()) {
  const validatedBase = validatePath(worktreePath);
  const flowPath = path.join(validatedBase, getStateDir(worktreePath), FLOW_FILE);
  validatePathWithinBase(flowPath, validatedBase);
  return flowPath;
}

/**
 * Read flow.json from worktree
 * Returns null if file doesn't exist or is corrupted
 * Logs critical error on corruption to prevent silent data loss
 */
function readFlow(worktreePath = process.cwd()) {
  const flowPath = getFlowPath(worktreePath);
  if (!fs.existsSync(flowPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(flowPath, 'utf8'));
  } catch (e) {
    console.error(`[CRITICAL] Corrupted flow.json at ${flowPath}: ${e.message}`);
    return null;
  }
}

/**
 * Write flow.json to worktree
 * Creates a copy to avoid mutating the original object
 * Increments version for optimistic locking
 */
function writeFlow(flow, worktreePath = process.cwd()) {
  ensureStateDir(worktreePath);
  // Clone to avoid mutating the original object
  const flowCopy = structuredClone(flow);
  flowCopy.lastUpdate = new Date().toISOString();
  // Increment version for optimistic locking (initialize if missing)
  flowCopy._version = (flowCopy._version || 0) + 1;
  const flowPath = getFlowPath(worktreePath);
  writeJsonAtomic(flowPath, flowCopy);
  return true;
}

/**
 * Update flow.json with partial updates
 * Handles null values correctly (null overwrites existing values)
 * Deep merges nested objects when both exist
 * Uses optimistic locking with version check and retry
 */
function updateFlow(updates, worktreePath = process.cwd()) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const flow = readFlow(worktreePath) || {};
    const initialVersion = flow._version || 0;

    for (const [key, value] of Object.entries(updates)) {
      // Skip internal version field from updates
      if (key === '_version') continue;

      // Null explicitly overwrites
      if (value === null) {
        flow[key] = null;
      }
      // Deep merge if both source and target are non-null objects
      else if (
        value && typeof value === 'object' && !Array.isArray(value) &&
        flow[key] && typeof flow[key] === 'object' && !Array.isArray(flow[key])
      ) {
        flow[key] = { ...flow[key], ...value };
      }
      // Otherwise direct assignment
      else {
        flow[key] = value;
      }
    }

    // Preserve version for write (writeFlow will increment it)
    flow._version = initialVersion;

    // Write and verify version wasn't changed by another process
    writeFlow(flow, worktreePath);

    // Re-read to verify our write succeeded
    const afterWrite = readFlow(worktreePath);
    if (afterWrite && afterWrite._version === initialVersion + 1) {
      return true; // Success
    }

    // Version conflict - retry after brief delay
    if (attempt < MAX_RETRIES - 1) {
      // Small random delay to reduce collision probability
      const delay = Math.floor(Math.random() * 50) + 10;
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Busy wait (synchronous delay)
      }
    }
  }

  // All retries exhausted
  console.error('[WARN] updateFlow: max retries exceeded, possible version conflict');
  return true; // Return true to not break callers, but log warning
}

/**
 * Create initial flow for a new task
 * Also registers the task as active in the main project's tasks.json
 * @param {Object} task - Task object with id, title, source, url
 * @param {Object} policy - Policy object with stoppingPoint
 * @param {string} worktreePath - Path to worktree
 * @param {string} projectPath - Path to main project (for tasks.json registration)
 */
function createFlow(task, policy, worktreePath = process.cwd(), projectPath = null) {
  const flow = {
    task: {
      id: task.id,
      title: task.title,
      source: task.source,
      url: task.url || null
    },
    policy: {
      stoppingPoint: policy.stoppingPoint || 'merged'
    },
    phase: 'policy-selection',
    status: 'in_progress',
    lastUpdate: new Date().toISOString(),
    userNotes: '',
    git: {
      branch: null,
      baseBranch: 'main'
    },
    pr: null,
    exploration: null,
    plan: null,
    // Store projectPath so completeWorkflow knows where to clear the task
    projectPath: projectPath
  };

  writeFlow(flow, worktreePath);

  // Register task as active in main project
  if (projectPath) {
    setActiveTask({
      taskId: task.id,
      title: task.title,
      worktree: worktreePath,
      branch: flow.git.branch
    }, projectPath);
  }

  return flow;
}

/**
 * Delete flow.json
 */
function deleteFlow(worktreePath = process.cwd()) {
  const flowPath = getFlowPath(worktreePath);
  if (fs.existsSync(flowPath)) {
    fs.unlinkSync(flowPath);
    return true;
  }
  return false;
}

// =============================================================================
// PHASE MANAGEMENT
// =============================================================================

/**
 * Check if phase is valid
 */
function isValidPhase(phase) {
  return PHASES.includes(phase);
}

/**
 * Set current phase
 */
function setPhase(phase, worktreePath = process.cwd()) {
  if (!isValidPhase(phase)) {
    throw new Error(`Invalid phase: ${phase}`);
  }
  return updateFlow({ phase, status: 'in_progress' }, worktreePath);
}

/**
 * Start a phase (alias for setPhase, for backwards compatibility)
 */
function startPhase(phase, worktreePath = process.cwd()) {
  return setPhase(phase, worktreePath);
}

/**
 * Fail the current phase
 */
function failPhase(reason, context = {}, worktreePath = process.cwd()) {
  const flow = readFlow(worktreePath);
  if (!flow) return null;

  return updateFlow({
    status: 'failed',
    error: reason,
    failContext: context
  }, worktreePath);
}

/**
 * Skip to a specific phase
 */
function skipToPhase(phase, reason = 'manual skip', worktreePath = process.cwd()) {
  if (!isValidPhase(phase)) {
    throw new Error(`Invalid phase: ${phase}`);
  }
  return updateFlow({
    phase,
    status: 'in_progress',
    skipReason: reason
  }, worktreePath);
}

/**
 * Complete current phase and move to next
 * Uses updateFlow pattern to avoid direct mutation issues
 */
function completePhase(result = null, worktreePath = process.cwd()) {
  const flow = readFlow(worktreePath);
  if (!flow) return null;

  const currentIndex = PHASES.indexOf(flow.phase);
  const nextPhase = PHASES[currentIndex + 1] || 'complete';

  // Build updates object
  const updates = {
    phase: nextPhase,
    status: nextPhase === 'complete' ? 'completed' : 'in_progress'
  };

  // Store result in appropriate field
  if (result) {
    const resultField = getResultField(flow.phase);
    if (resultField) {
      updates[resultField] = result;
    }
  }

  updateFlow(updates, worktreePath);
  return readFlow(worktreePath);
}

/**
 * Map phase to result field
 */
function getResultField(phase) {
  const mapping = {
    'exploration': 'exploration',
    'planning': 'plan',
    'review-loop': 'reviewResult'
  };
  return mapping[phase] || null;
}

/**
 * Mark workflow as failed
 */
function failWorkflow(error, worktreePath = process.cwd()) {
  return updateFlow({
    status: 'failed',
    error: error?.message || String(error)
  }, worktreePath);
}

/**
 * Mark workflow as complete
 * Automatically clears the active task from tasks.json using stored projectPath
 * @param {string} worktreePath - Path to worktree
 */
function completeWorkflow(worktreePath = process.cwd()) {
  const flow = readFlow(worktreePath);

  // Clear active task from main project if projectPath is stored
  if (flow && flow.projectPath) {
    clearActiveTask(flow.projectPath);
  }

  return updateFlow({
    phase: 'complete',
    status: 'completed',
    completedAt: new Date().toISOString()
  }, worktreePath);
}

/**
 * Abort workflow
 * Also clears the active task from tasks.json using stored projectPath
 */
function abortWorkflow(reason, worktreePath = process.cwd()) {
  const flow = readFlow(worktreePath);

  // Clear active task from main project if projectPath is stored
  if (flow && flow.projectPath) {
    clearActiveTask(flow.projectPath);
  }

  return updateFlow({
    status: 'aborted',
    abortReason: reason,
    abortedAt: new Date().toISOString()
  }, worktreePath);
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Get workflow summary for display
 */
function getFlowSummary(worktreePath = process.cwd()) {
  const flow = readFlow(worktreePath);
  if (!flow) return null;

  return {
    task: flow.task?.title || 'Unknown',
    taskId: flow.task?.id,
    phase: flow.phase,
    status: flow.status,
    lastUpdate: flow.lastUpdate,
    pr: flow.pr?.number ? `#${flow.pr.number}` : null
  };
}

/**
 * Check if workflow can be resumed
 */
function canResume(worktreePath = process.cwd()) {
  const flow = readFlow(worktreePath);
  if (!flow) return false;
  return flow.status === 'in_progress' && flow.phase !== 'complete';
}

// =============================================================================
// BACKWARDS COMPATIBILITY ALIASES
// =============================================================================

// These maintain compatibility with existing agent code
const readState = readFlow;
const writeState = writeFlow;
const updateState = updateFlow;
const createState = (type, policy) => createFlow({ id: 'manual', title: 'Manual task', source: 'manual' }, policy);
const deleteState = deleteFlow;
const hasActiveWorkflow = hasActiveTask;
const getWorkflowSummary = getFlowSummary;

module.exports = {
  // Constants
  PHASES,

  // Tasks (main project)
  getTasksPath,
  readTasks,
  writeTasks,
  setActiveTask,
  clearActiveTask,
  hasActiveTask,

  // Flow (worktree)
  getFlowPath,
  readFlow,
  writeFlow,
  updateFlow,
  createFlow,
  deleteFlow,

  // Phase management
  isValidPhase,
  setPhase,
  startPhase,
  completePhase,
  failPhase,
  skipToPhase,
  failWorkflow,
  completeWorkflow,
  abortWorkflow,

  // Convenience
  getFlowSummary,
  canResume,
  generateWorkflowId,

  // Backwards compatibility
  readState,
  writeState,
  updateState,
  createState,
  deleteState,
  hasActiveWorkflow,
  getWorkflowSummary
};
