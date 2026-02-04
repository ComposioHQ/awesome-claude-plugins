/**
 * Plugin Interface Type Definitions
 * Centralized type definitions for all plugin components
 *
 * @module lib/types
 * @author Avi Fenesh
 * @license MIT
 */

// Re-export all types
export * from './plugin-manifest';
export * from './command-frontmatter';
export * from './agent-frontmatter';
export * from './skill-frontmatter';
export * from './hook-frontmatter';

/**
 * Plugin component types union
 */
export type PluginComponentType = 'command' | 'agent' | 'skill' | 'hook';

/**
 * Plugin directory structure
 */
export interface PluginStructure {
  /** Plugin root directory */
  root: string;

  /** Plugin manifest (plugin.json) */
  manifest: string;

  /** Commands directory */
  commands?: string;

  /** Agents directory */
  agents?: string;

  /** Skills directory */
  skills?: string;

  /** Hooks directory */
  hooks?: string;

  /** Shared library directory */
  lib?: string;

  /** Tests directory */
  tests?: string;
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  /** Whether plugin is valid */
  valid: boolean;

  /** Validation errors (if any) */
  errors: string[];

  /** Validation warnings (if any) */
  warnings: string[];

  /** Detected components */
  components: {
    commands: number;
    agents: number;
    skills: number;
    hooks: number;
  };
}

/**
 * Standard plugin directory structure
 */
export const PLUGIN_STRUCTURE: Readonly<Record<string, string>> = {
  MANIFEST: '.claude-plugin/plugin.json',
  COMMANDS: 'commands',
  AGENTS: 'agents',
  SKILLS: 'skills',
  HOOKS: 'hooks',
  LIB: 'lib',
  TESTS: 'tests'
} as const;
