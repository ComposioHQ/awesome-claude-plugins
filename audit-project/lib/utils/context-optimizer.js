/**
 * Context Optimizer Utilities
 * Provides optimized git commands to minimize token usage while gathering context
 *
 * Target: Keep command execution under 50k tokens
 *
 * @author Avi Fenesh
 * @license MIT
 */

const {
  escapeShell,
  escapeSingleQuotes,
  sanitizeExtension
} = require('./shell-escape');

/**
 * Validate git branch name to prevent command injection
 * @param {string} branch - Branch name to validate
 * @returns {string} Validated branch name
 * @throws {Error} If branch name contains invalid characters
 */
function validateBranchName(branch) {
  if (typeof branch !== 'string' || branch.length === 0) {
    throw new Error('Branch name must be a non-empty string');
  }
  if (branch.length > 255) {
    throw new Error('Branch name too long (max 255 characters)');
  }
  // Allow alphanumeric, underscore, hyphen, forward slash, and dot
  if (!/^[a-zA-Z0-9/_.-]+$/.test(branch)) {
    throw new Error('Branch name contains invalid characters');
  }
  // Prevent git option injection
  if (branch.startsWith('-')) {
    throw new Error('Branch name cannot start with hyphen');
  }
  return branch;
}

/**
 * Validate git reference to prevent command injection
 * @param {string} ref - Git reference to validate
 * @returns {string} Validated reference
 * @throws {Error} If reference contains invalid characters
 */
function validateGitRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error('Git reference must be a non-empty string');
  }
  if (ref.length > 255) {
    throw new Error('Git reference too long (max 255 characters)');
  }
  // Allow alphanumeric, tilde, caret, dot, hyphen, underscore, forward slash
  if (!/^[a-zA-Z0-9~^._/-]+$/.test(ref)) {
    throw new Error('Git reference contains invalid characters');
  }
  // Prevent git option injection
  if (ref.startsWith('-')) {
    throw new Error('Git reference cannot start with hyphen');
  }
  return ref;
}

/**
 * Validate numeric limit parameter
 * @param {number} limit - Limit value to validate
 * @param {number} max - Maximum allowed value (default: 1000)
 * @returns {number} Validated limit
 * @throws {Error} If limit is invalid
 */
function validateLimit(limit, max = 1000) {
  // Strict type check - must be number or numeric string
  if (typeof limit === 'string') {
    // Only allow pure numeric strings
    if (!/^\d+$/.test(limit)) {
      throw new Error('Limit must be a positive integer');
    }
  }
  const num = typeof limit === 'number' ? limit : parseInt(limit, 10);
  if (!Number.isInteger(num) || num < 1) {
    throw new Error('Limit must be a positive integer');
  }
  if (num > max) {
    throw new Error(`Limit cannot exceed ${max}`);
  }
  return num;
}

/**
 * Git command optimization utilities for context efficiency
 */
const contextOptimizer = {
  /**
   * Get recent commits with minimal formatting
   * @param {number} limit - Number of commits to retrieve (default: 10)
   * @returns {string} Git command
   */
  recentCommits: (limit = 10) => {
    const safeLimit = validateLimit(limit);
    return `git log --oneline --no-decorate -${safeLimit} --format="%h %s"`;
  },

  /**
   * Get compact git status (untracked files excluded)
   * @returns {string} Git command
   */
  compactStatus: () =>
    'git status -uno --porcelain',

  /**
   * Get file changes between refs
   * @param {string} ref - Reference to compare from (default: 'HEAD~5')
   * @returns {string} Git command
   */
  fileChanges: (ref = 'HEAD~5') => {
    const safeRef = validateGitRef(ref);
    return `git diff ${safeRef}..HEAD --name-status`;
  },

  /**
   * Get current branch name
   * @returns {string} Git command
   */
  currentBranch: () =>
    'git branch --show-current',

  /**
   * Get remote information (limited to 2 lines)
   * @returns {string} Git command
   */
  remoteInfo: () =>
    'git remote -v | head -2',

  /**
   * Check if there are stashed changes
   * @returns {string} Git command
   */
  hasStashes: () =>
    'git stash list --oneline | wc -l',

  /**
   * Get worktree list in porcelain format
   * @returns {string} Git command
   */
  worktreeList: () =>
    'git worktree list --porcelain',

  /**
   * Get the age of a specific line (for TODO checking)
   * @param {string} file - File path
   * @param {number} line - Line number
   * @returns {string} Git command
   */
  lineAge: (file, line) => {
    // Validate line is a positive integer with reasonable bounds
    const lineNum = parseInt(line, 10);
    const MAX_LINE_NUMBER = 10000000; // 10 million lines - reasonable upper bound
    if (!Number.isInteger(lineNum) || lineNum < 1) {
      throw new Error('Line must be a positive integer');
    }
    if (lineNum > MAX_LINE_NUMBER) {
      throw new Error(`Line number cannot exceed ${MAX_LINE_NUMBER}`);
    }
    // Escape file path for safe shell usage
    const safeFile = escapeShell(file);
    return `git blame -L ${lineNum},${lineNum} "${safeFile}" --porcelain | grep '^committer-time' | cut -d' ' -f2`;
  },

  /**
   * Find source files by extension
   * @param {string} extension - File extension (e.g., 'ts', 'py', 'rs')
   * @returns {string} Git command
   */
  findSourceFiles: (extension = 'ts') => {
    const safeExt = sanitizeExtension(extension);
    return `git ls-files | grep '\\.${safeExt}$'`;
  },

  /**
   * Get diff stat summary
   * @param {string} ref - Reference to compare from (default: 'HEAD~5')
   * @returns {string} Git command
   */
  diffStat: (ref = 'HEAD~5') => {
    const safeRef = validateGitRef(ref);
    return `git diff ${safeRef}..HEAD --stat | head -20`;
  },

  /**
   * Get contributors list (limited to top 10)
   * @returns {string} Git command
   */
  contributors: () =>
    'git shortlog -sn --no-merges | head -10',

  /**
   * Get last commit message
   * @returns {string} Git command
   */
  lastCommitMessage: () =>
    'git log -1 --format=%s',

  /**
   * Get files changed in last commit
   * @returns {string} Git command
   */
  lastCommitFiles: () =>
    'git diff-tree --no-commit-id --name-only -r HEAD',

  /**
   * Get branch list (local only, limited)
   * @param {number} limit - Number of branches (default: 10)
   * @returns {string} Git command
   */
  branches: (limit = 10) => {
    const safeLimit = validateLimit(limit);
    return `git branch --format='%(refname:short)' | head -${safeLimit}`;
  },

  /**
   * Get tags list (limited)
   * @param {number} limit - Number of tags (default: 10)
   * @returns {string} Git command
   */
  tags: (limit = 10) => {
    const safeLimit = validateLimit(limit);
    return `git tag --sort=-creatordate | head -${safeLimit}`;
  },

  /**
   * Get count of commits on current branch since branching from main
   * @param {string} mainBranch - Main branch name (default: 'main')
   * @returns {string} Git command
   */
  commitsSinceBranch: (mainBranch = 'main') => {
    const safeBranch = validateBranchName(mainBranch);
    return `git rev-list --count ${safeBranch}..HEAD`;
  },

  /**
   * Check if working directory is clean
   * @returns {string} Git command
   */
  isClean: () =>
    'git status --porcelain | wc -l',

  /**
   * Get merge base with main branch
   * @param {string} mainBranch - Main branch name (default: 'main')
   * @returns {string} Git command
   */
  mergeBase: (mainBranch = 'main') => {
    const safeBranch = validateBranchName(mainBranch);
    return `git merge-base ${safeBranch} HEAD`;
  },

  /**
   * Get files modified in current branch (since branching)
   * @param {string} mainBranch - Main branch name (default: 'main')
   * @returns {string} Git command
   */
  branchChangedFiles: (mainBranch = 'main') => {
    const safeBranch = validateBranchName(mainBranch);
    return `git diff ${safeBranch}...HEAD --name-only`;
  },

  /**
   * Get commit count by author
   * @param {string} author - Author name or email
   * @returns {string} Git command
   */
  authorCommitCount: (author) => {
    const safeAuthor = escapeShell(author);
    return `git log --author="${safeAuthor}" --oneline | wc -l`;
  },

  /**
   * Check if file exists in repository
   * @param {string} file - File path
   * @returns {string} Git command
   */
  fileExists: (file) => {
    const safeFile = escapeSingleQuotes(file);
    return `git ls-files | grep -q '${safeFile}' && echo 'true' || echo 'false'`;
  }
};

// Export main API
module.exports = contextOptimizer;

// Export internal functions for testing
module.exports._internal = {
  escapeShell,
  escapeSingleQuotes,
  sanitizeExtension,
  validateBranchName,
  validateGitRef,
  validateLimit
};
