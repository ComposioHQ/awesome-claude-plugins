/**
 * Command Frontmatter Type Definitions
 * Defines the structure of YAML frontmatter in command markdown files
 *
 * @module lib/types/command-frontmatter
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Command argument definition
 */
export interface CommandArgument {
  /** Argument name */
  name: string;
  /** Argument description */
  description: string;
  /** Whether argument is required */
  required?: boolean;
  /** Default value if not provided */
  default?: string | number | boolean;
  /** Allowed values (enum) */
  enum?: string[];
}

/**
 * Command frontmatter structure
 * YAML metadata at the top of command markdown files
 */
export interface CommandFrontmatter {
  /** Command name (should match filename without extension) */
  command: string;

  /** Short description shown in help */
  description: string;

  /** Argument hint shown in autocomplete (e.g., "[options]", "<file>") */
  'argument-hint'?: string;

  /** Detailed usage examples */
  usage?: string[];

  /** Command arguments definition */
  arguments?: CommandArgument[];

  /** Command aliases (alternative names) */
  aliases?: string[];

  /** Command category for grouping */
  category?: string;

  /** Whether command requires git repository */
  requiresGit?: boolean;

  /** Whether command requires network access */
  requiresNetwork?: boolean;

  /** Preferred model for this command (sonnet, opus, haiku) */
  model?: 'sonnet' | 'opus' | 'haiku';

  /** Maximum number of turns for multi-turn commands */
  maxTurns?: number;

  /** Tags for searchability */
  tags?: string[];
}

/**
 * Type guard to check if an object is valid CommandFrontmatter
 */
export function isCommandFrontmatter(obj: unknown): obj is CommandFrontmatter {
  if (typeof obj !== 'object' || obj === null) return false;
  const fm = obj as Partial<CommandFrontmatter>;

  return (
    typeof fm.command === 'string' &&
    fm.command.length > 0 &&
    typeof fm.description === 'string' &&
    fm.description.length > 0
  );
}

/**
 * Validates command frontmatter
 * @throws {Error} If frontmatter is invalid
 */
export function validateCommandFrontmatter(
  frontmatter: unknown
): asserts frontmatter is CommandFrontmatter {
  if (!isCommandFrontmatter(frontmatter)) {
    throw new Error('Invalid command frontmatter: missing required fields');
  }

  // Additional validations
  if (frontmatter.arguments && !Array.isArray(frontmatter.arguments)) {
    throw new Error('Invalid command frontmatter: arguments must be an array');
  }

  if (frontmatter.model && !['sonnet', 'opus', 'haiku'].includes(frontmatter.model)) {
    throw new Error('Invalid command frontmatter: model must be sonnet, opus, or haiku');
  }

  if (frontmatter.maxTurns !== undefined &&
      (typeof frontmatter.maxTurns !== 'number' || frontmatter.maxTurns < 1)) {
    throw new Error('Invalid command frontmatter: maxTurns must be a positive number');
  }
}
