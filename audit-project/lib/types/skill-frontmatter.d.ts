/**
 * Skill Frontmatter Type Definitions
 * Defines the structure of YAML frontmatter in skill markdown files
 *
 * @module lib/types/skill-frontmatter
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Skill frontmatter structure
 * YAML metadata at the top of skill markdown files
 */
export interface SkillFrontmatter {
  /** Skill unique identifier (kebab-case) */
  skill: string;

  /** Short description of skill purpose */
  description: string;

  /** Skill category for organization */
  category?: string;

  /** When this skill should be invoked (triggering conditions) */
  'when-to-use'?: string[];

  /** Example usage scenarios */
  examples?: string[];

  /** Preferred model for this skill (sonnet, opus, haiku) */
  model?: 'sonnet' | 'opus' | 'haiku';

  /** Whether skill requires user approval before running */
  requiresApproval?: boolean;

  /** Tags for searchability */
  tags?: string[];

  /** Related commands or skills */
  related?: string[];
}

/**
 * Type guard to check if an object is valid SkillFrontmatter
 */
export function isSkillFrontmatter(obj: unknown): obj is SkillFrontmatter {
  if (typeof obj !== 'object' || obj === null) return false;
  const fm = obj as Partial<SkillFrontmatter>;

  return (
    typeof fm.skill === 'string' &&
    fm.skill.length > 0 &&
    typeof fm.description === 'string' &&
    fm.description.length > 0
  );
}

/**
 * Validates skill frontmatter
 * @throws {Error} If frontmatter is invalid
 */
export function validateSkillFrontmatter(
  frontmatter: unknown
): asserts frontmatter is SkillFrontmatter {
  if (!isSkillFrontmatter(frontmatter)) {
    throw new Error('Invalid skill frontmatter: missing required fields');
  }

  // Additional validations
  if (frontmatter.model && !['sonnet', 'opus', 'haiku'].includes(frontmatter.model)) {
    throw new Error('Invalid skill frontmatter: model must be sonnet, opus, or haiku');
  }

  if (frontmatter['when-to-use'] && !Array.isArray(frontmatter['when-to-use'])) {
    throw new Error('Invalid skill frontmatter: when-to-use must be an array');
  }

  if (frontmatter.examples && !Array.isArray(frontmatter.examples)) {
    throw new Error('Invalid skill frontmatter: examples must be an array');
  }

  if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
    throw new Error('Invalid skill frontmatter: tags must be an array');
  }

  if (frontmatter.related && !Array.isArray(frontmatter.related)) {
    throw new Error('Invalid skill frontmatter: related must be an array');
  }
}
