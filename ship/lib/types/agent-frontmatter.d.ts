/**
 * Agent Frontmatter Type Definitions
 * Defines the structure of YAML frontmatter in agent markdown files
 *
 * @module lib/types/agent-frontmatter
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Tool permission for agent
 */
export type AgentTool =
  | 'Bash'
  | 'Bash(git:*)'
  | 'Bash(gh:*)'
  | 'Bash(npm:*)'
  | 'Bash(node:*)'
  | 'Bash(deployment:*)'
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Glob'
  | 'Grep'
  | 'Task'
  | 'LSP'
  | 'EnterPlanMode'
  | 'ExitPlanMode'
  | 'AskUserQuestion'
  | 'TodoWrite'
  | 'WebFetch'
  | 'WebSearch'
  | string; // Allow custom tools

/**
 * Agent color for UI identification
 */
export type AgentColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'pink'
  | 'cyan';

/**
 * Agent frontmatter structure
 * YAML metadata at the top of agent markdown files
 */
export interface AgentFrontmatter {
  /** Agent unique identifier (kebab-case) */
  agent: string;

  /** Short description of agent purpose */
  description: string;

  /** Tools the agent has access to */
  tools?: AgentTool[];

  /** Preferred model for this agent (sonnet, opus, haiku) */
  model?: 'sonnet' | 'opus' | 'haiku';

  /** Maximum number of turns before stopping */
  maxTurns?: number;

  /** UI color for agent identification */
  color?: AgentColor;

  /** Whether agent can run in background */
  canRunInBackground?: boolean;

  /** Whether agent requires user approval before running */
  requiresApproval?: boolean;

  /** Agent category for organization */
  category?: string;

  /** Tags for searchability */
  tags?: string[];

  /** When this agent should be used (triggering conditions) */
  'when-to-use'?: string[];

  /** Example usage scenarios */
  examples?: string[];
}

/**
 * Type guard to check if an object is valid AgentFrontmatter
 */
export function isAgentFrontmatter(obj: unknown): obj is AgentFrontmatter {
  if (typeof obj !== 'object' || obj === null) return false;
  const fm = obj as Partial<AgentFrontmatter>;

  return (
    typeof fm.agent === 'string' &&
    fm.agent.length > 0 &&
    typeof fm.description === 'string' &&
    fm.description.length > 0
  );
}

/**
 * Validates agent frontmatter
 * @throws {Error} If frontmatter is invalid
 */
export function validateAgentFrontmatter(
  frontmatter: unknown
): asserts frontmatter is AgentFrontmatter {
  if (!isAgentFrontmatter(frontmatter)) {
    throw new Error('Invalid agent frontmatter: missing required fields');
  }

  // Additional validations
  if (frontmatter.tools && !Array.isArray(frontmatter.tools)) {
    throw new Error('Invalid agent frontmatter: tools must be an array');
  }

  if (frontmatter.model && !['sonnet', 'opus', 'haiku'].includes(frontmatter.model)) {
    throw new Error('Invalid agent frontmatter: model must be sonnet, opus, or haiku');
  }

  if (frontmatter.maxTurns !== undefined &&
      (typeof frontmatter.maxTurns !== 'number' || frontmatter.maxTurns < 1)) {
    throw new Error('Invalid agent frontmatter: maxTurns must be a positive number');
  }

  const validColors: AgentColor[] = ['blue', 'green', 'purple', 'orange', 'red', 'yellow', 'pink', 'cyan'];
  if (frontmatter.color && !validColors.includes(frontmatter.color)) {
    throw new Error(`Invalid agent frontmatter: color must be one of ${validColors.join(', ')}`);
  }
}
