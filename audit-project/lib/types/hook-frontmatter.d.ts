/**
 * Hook Frontmatter Type Definitions
 * Defines the structure of YAML frontmatter in hook markdown files
 *
 * @module lib/types/hook-frontmatter
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Hook event types
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'PreCompact'
  | 'Notification';

/**
 * Hook frontmatter structure
 * YAML metadata at the top of hook markdown files
 */
export interface HookFrontmatter {
  /** Hook unique identifier (kebab-case) */
  hook: string;

  /** Event that triggers this hook */
  event: HookEvent;

  /** Short description of hook purpose */
  description: string;

  /** Tool name this hook applies to (for PreToolUse/PostToolUse) */
  tool?: string;

  /** Hook priority (higher = runs first, default: 0) */
  priority?: number;

  /** Whether hook is enabled by default */
  enabled?: boolean;

  /** Hook category for organization */
  category?: string;

  /** Tags for searchability */
  tags?: string[];

  /** Related hooks */
  related?: string[];
}

/**
 * Type guard to check if an object is valid HookFrontmatter
 */
export function isHookFrontmatter(obj: unknown): obj is HookFrontmatter {
  if (typeof obj !== 'object' || obj === null) return false;
  const fm = obj as Partial<HookFrontmatter>;

  const validEvents: HookEvent[] = [
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'SubagentStop',
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'PreCompact',
    'Notification'
  ];

  return (
    typeof fm.hook === 'string' &&
    fm.hook.length > 0 &&
    typeof fm.event === 'string' &&
    validEvents.includes(fm.event as HookEvent) &&
    typeof fm.description === 'string' &&
    fm.description.length > 0
  );
}

/**
 * Validates hook frontmatter
 * @throws {Error} If frontmatter is invalid
 */
export function validateHookFrontmatter(
  frontmatter: unknown
): asserts frontmatter is HookFrontmatter {
  if (!isHookFrontmatter(frontmatter)) {
    throw new Error('Invalid hook frontmatter: missing required fields or invalid event type');
  }

  // Tool-specific hooks must specify tool
  if ((frontmatter.event === 'PreToolUse' || frontmatter.event === 'PostToolUse') &&
      !frontmatter.tool) {
    throw new Error('Invalid hook frontmatter: PreToolUse and PostToolUse hooks must specify tool');
  }

  if (frontmatter.priority !== undefined &&
      (typeof frontmatter.priority !== 'number' || !Number.isInteger(frontmatter.priority))) {
    throw new Error('Invalid hook frontmatter: priority must be an integer');
  }

  if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
    throw new Error('Invalid hook frontmatter: tags must be an array');
  }

  if (frontmatter.related && !Array.isArray(frontmatter.related)) {
    throw new Error('Invalid hook frontmatter: related must be an array');
  }
}
