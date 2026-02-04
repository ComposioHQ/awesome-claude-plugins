/**
 * ast-grep installation detection and helpers
 * 
 * @module lib/repo-map/installer
 */

'use strict';

const { execSync, execFileSync, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Commands to try (sg is the common alias)
const AST_GREP_COMMANDS = ['sg', 'ast-grep'];

function pickCommandPath(pathOutput) {
  if (!pathOutput) return null;
  const candidates = pathOutput.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (candidates.length === 0) return null;

  if (process.platform !== 'win32') {
    return candidates[0];
  }

  const exe = candidates.find(candidate => candidate.toLowerCase().endsWith('.exe'));
  if (exe) return exe;

  const primary = candidates[0];
  if (!primary) return null;

  const baseDir = path.dirname(primary);
  const npmExe = path.join(baseDir, 'node_modules', '@ast-grep', 'cli', 'sg.exe');
  if (fs.existsSync(npmExe)) return npmExe;

  return primary;
}

/**
 * Check if ast-grep is installed
 * @returns {Promise<{found: boolean, version?: string, path?: string, command?: string}>}
 */
async function checkInstalled() {
  for (const cmd of AST_GREP_COMMANDS) {
    try {
      // Try to get version using execFileAsync (no shell, safe from injection)
      const { stdout } = await execFileAsync(cmd, ['--version'], {
        timeout: 5000,
        windowsHide: true,
        shell: process.platform === 'win32' // Windows needs shell for PATH lookup
      });

      const version = stdout.trim().replace(/^ast-grep\s*/i, '');

      // Try to get path
      let cmdPath = null;
      try {
        const whereCmd = process.platform === 'win32' ? 'where' : 'which';
        // Use execFileAsync with args array (no shell interpolation)
        const { stdout: pathOut } = await execFileAsync(whereCmd, [cmd], {
          timeout: 5000,
          windowsHide: true,
          shell: process.platform === 'win32'
        });
        cmdPath = pickCommandPath(pathOut);
      } catch {
        // Path lookup failed, but command works
      }

      return {
        found: true,
        version,
        path: cmdPath,
        command: cmdPath || cmd
      };
    } catch {
      // This command not found, try next
      continue;
    }
  }

  return { found: false };
}

/**
 * Check if ast-grep is installed (sync version)
 * @returns {{found: boolean, version?: string, command?: string, path?: string}}
 */
function checkInstalledSync() {
  for (const cmd of AST_GREP_COMMANDS) {
    try {
      // Use execFileSync with args array (no shell interpolation, safe from injection)
      const stdout = execFileSync(cmd, ['--version'], {
        timeout: 5000,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32' // Windows needs shell for PATH lookup
      });

      const version = stdout.trim().replace(/^ast-grep\s*/i, '');
      let cmdPath = null;

      try {
        const whereCmd = process.platform === 'win32' ? 'where' : 'which';
        // Use execFileSync with args array (no shell interpolation)
        const pathOut = execFileSync(whereCmd, [cmd], {
          timeout: 5000,
          windowsHide: true,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32'
        });
        cmdPath = pickCommandPath(pathOut);
      } catch {
        // Path lookup failed, but command works
      }

      return { found: true, version, command: cmdPath || cmd, path: cmdPath };
    } catch {
      continue;
    }
  }

  return { found: false };
}

/**
 * Get the working ast-grep command
 * @returns {string|null}
 */
function getCommand() {
  const result = checkInstalledSync();
  return result.found ? result.command : null;
}

/**
 * Get installation instructions for ast-grep
 * @returns {string}
 */
function getInstallInstructions() {
  return `ast-grep (sg) is required for repo-map functionality.

Install using one of these methods:

  npm:      npm install -g @ast-grep/cli
  pip:      pip install ast-grep-cli
  brew:     brew install ast-grep
  cargo:    cargo install ast-grep --locked
  scoop:    scoop install main/ast-grep

After installation, verify with: sg --version

Documentation: https://ast-grep.github.io/`;
}

/**
 * Get a short install suggestion (one line)
 * @returns {string}
 */
function getShortInstallSuggestion() {
  if (process.platform === 'win32') {
    return 'Install ast-grep: npm i -g @ast-grep/cli (or scoop install ast-grep)';
  } else if (process.platform === 'darwin') {
    return 'Install ast-grep: brew install ast-grep (or npm i -g @ast-grep/cli)';
  } else {
    return 'Install ast-grep: npm i -g @ast-grep/cli (or pip install ast-grep-cli)';
  }
}

/**
 * Get minimum required version
 * @returns {string}
 */
function getMinimumVersion() {
  return '0.20.0'; // Require at least this version for JSON output support
}

/**
 * Check if installed version meets minimum requirements
 * @param {string} version - Installed version
 * @returns {boolean}
 */
function meetsMinimumVersion(version) {
  if (!version) return false;
  
  // Parse version (e.g., "0.25.0" or "0.25.0-beta.1")
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  
  const [, major, minor, patch] = match.map(Number);
  const [reqMajor, reqMinor, reqPatch] = getMinimumVersion().split('.').map(Number);
  
  if (major > reqMajor) return true;
  if (major < reqMajor) return false;
  if (minor > reqMinor) return true;
  if (minor < reqMinor) return false;
  return patch >= reqPatch;
}

module.exports = {
  checkInstalled,
  checkInstalledSync,
  getCommand,
  getInstallInstructions,
  getShortInstallSuggestion,
  getMinimumVersion,
  meetsMinimumVersion,
  AST_GREP_COMMANDS
};
