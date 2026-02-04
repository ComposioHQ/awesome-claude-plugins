/**
 * Plugin Manifest Type Definitions
 * Defines the structure of plugin.json files
 *
 * @module lib/types/plugin-manifest
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Author information for plugin manifest
 */
export interface PluginAuthor {
  /** Author's full name */
  name: string;
  /** Author's email address (optional) */
  email?: string;
  /** Author's website or GitHub profile URL (optional) */
  url?: string;
}

/**
 * Plugin manifest structure
 * Required fields for all Claude Code plugins
 */
export interface PluginManifest {
  /** Unique plugin identifier (kebab-case, lowercase) */
  name: string;

  /** Semantic version (MAJOR.MINOR.PATCH) */
  version: string;

  /** Short description of plugin functionality */
  description: string;

  /** Author information */
  author: PluginAuthor;

  /** Plugin homepage URL (optional) */
  homepage?: string;

  /** Repository URL (optional) */
  repository?: string;

  /** License identifier (SPDX format, e.g., "MIT", "Apache-2.0") */
  license: string;

  /** Search keywords for discoverability (optional) */
  keywords?: string[];

  /** Minimum Claude Code version required (optional) */
  minClaudeVersion?: string;

  /** Plugin dependencies (optional) */
  dependencies?: {
    [pluginName: string]: string; // version constraint
  };

  /** Plugin configuration schema (optional) */
  config?: {
    [key: string]: unknown;
  };
}

/**
 * Type guard to check if an object is a valid PluginManifest
 */
export function isPluginManifest(obj: unknown): obj is PluginManifest {
  if (typeof obj !== 'object' || obj === null) return false;
  const manifest = obj as Partial<PluginManifest>;

  return (
    typeof manifest.name === 'string' &&
    /^[a-z0-9-]+$/.test(manifest.name) &&
    typeof manifest.version === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/.test(manifest.version) &&
    typeof manifest.description === 'string' &&
    typeof manifest.author === 'object' &&
    manifest.author !== null &&
    typeof manifest.author.name === 'string' &&
    typeof manifest.license === 'string'
  );
}

/**
 * Validates a plugin manifest against the schema
 * @throws {Error} If manifest is invalid
 */
export function validatePluginManifest(manifest: unknown): asserts manifest is PluginManifest {
  if (!isPluginManifest(manifest)) {
    throw new Error('Invalid plugin manifest: missing required fields or invalid format');
  }

  // Additional validations
  if (manifest.keywords && !Array.isArray(manifest.keywords)) {
    throw new Error('Invalid plugin manifest: keywords must be an array');
  }

  if (manifest.dependencies && typeof manifest.dependencies !== 'object') {
    throw new Error('Invalid plugin manifest: dependencies must be an object');
  }
}
