#!/usr/bin/env python3
"""
Hardstop Plugin — PreToolUse Hook (Read)

Blocks reading of sensitive credential files to prevent secrets exposure.

Exit codes:
  0 = Success (uses JSON output for allow/deny decision)

Blocking uses permissionDecision: "deny" in JSON output instead of exit code 2.
This ensures consistent behavior between CLI and VS Code extension.

Design principle: Fail-closed. If safety check fails, block the read.
"""

import sys
import json
import re
import os
from pathlib import Path
from datetime import datetime
from typing import Tuple, Optional

# === CONFIGURATION ===

STATE_DIR = Path.home() / ".hardstop"
SKIP_FILE = STATE_DIR / "skip_next"
LOG_FILE = STATE_DIR / "audit.log"
DEBUG_FILE = STATE_DIR / "hook_debug.log"

# Fail-closed: if True, errors during safety check block the read
FAIL_CLOSED = True

# === DEBUG LOGGING ===

try:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with open(DEBUG_FILE, "a") as f:
        f.write(f"[{datetime.now().isoformat()}] Read hook invoked\n")
except:
    pass

# === DANGEROUS READ PATTERNS ===
# These paths contain secrets that should never be read by AI

DANGEROUS_READ_PATTERNS = [
    # === SSH Keys ===
    (r"[/\\]\.ssh[/\\]id_rsa$", "SSH private key (RSA)"),
    (r"[/\\]\.ssh[/\\]id_ed25519$", "SSH private key (Ed25519)"),
    (r"[/\\]\.ssh[/\\]id_ecdsa$", "SSH private key (ECDSA)"),
    (r"[/\\]\.ssh[/\\]id_dsa$", "SSH private key (DSA)"),
    (r"[/\\]\.ssh[/\\][^/\\]+\.pem$", "SSH PEM key file"),
    (r"[/\\]\.ssh[/\\][^/\\]+\.key$", "SSH key file"),
    (r"[/\\]\.ssh[/\\]known_hosts$", "SSH known hosts (reveals infrastructure)"),
    (r"[/\\]\.ssh[/\\]authorized_keys$", "SSH authorized keys"),
    (r"[/\\]\.ssh[/\\]config$", "SSH config (may contain hostnames, usernames)"),

    # === Cloud Credentials ===
    (r"[/\\]\.aws[/\\]credentials$", "AWS credentials file"),
    (r"[/\\]\.aws[/\\]config$", "AWS config file"),
    (r"[/\\]\.azure[/\\]credentials$", "Azure credentials file"),
    (r"[/\\]\.azure[/\\]accessTokens\.json$", "Azure access tokens"),
    (r"[/\\]\.config[/\\]gcloud[/\\]credentials\.db$", "GCP credentials database"),
    (r"[/\\]\.config[/\\]gcloud[/\\]application_default_credentials\.json$", "GCP application credentials"),
    (r"[/\\]\.config[/\\]gcloud[/\\]access_tokens\.db$", "GCP access tokens"),
    (r"[/\\]\.boto$", "Legacy AWS boto config"),

    # === Environment Files ===
    (r"[/\\]\.env$", "Environment file with secrets"),
    (r"[/\\]\.env\.local$", "Local environment file"),
    (r"[/\\]\.env\.production$", "Production environment file"),
    (r"[/\\]\.env\.development$", "Development environment file"),
    (r"[/\\]\.env\.staging$", "Staging environment file"),
    (r"[/\\]\.env\.test$", "Test environment file"),
    (r"[/\\]\.env\.[a-zA-Z0-9]+$", "Environment file variant"),

    # === Token/Secret Files ===
    (r"[/\\]credentials\.json$", "Credentials JSON file"),
    (r"[/\\]client_secret[^/\\]*\.json$", "OAuth client secret"),
    (r"[/\\]secrets\.yaml$", "Secrets YAML file"),
    (r"[/\\]secrets\.yml$", "Secrets YML file"),
    (r"[/\\]secrets\.json$", "Secrets JSON file"),
    (r"[/\\]\.netrc$", "Network credentials file"),
    (r"[/\\]\.npmrc$", "npm credentials file"),
    (r"[/\\]\.pypirc$", "PyPI credentials file"),
    (r"[/\\]\.gemrc$", "Ruby gems credentials"),
    (r"[/\\]\.nuget[/\\]NuGet\.Config$", "NuGet credentials"),

    # === Docker ===
    (r"[/\\]\.dockercfg$", "Docker config file"),
    (r"[/\\]\.docker[/\\]config\.json$", "Docker config with auth"),

    # === Kubernetes ===
    (r"[/\\]\.kube[/\\]config$", "Kubernetes config with credentials"),
    (r"[/\\]kubeconfig$", "Kubernetes config file"),
    (r"[/\\]kubeconfig\.yaml$", "Kubernetes config YAML"),

    # === Database ===
    (r"[/\\]\.pgpass$", "PostgreSQL password file"),
    (r"[/\\]\.my\.cnf$", "MySQL config with credentials"),
    (r"[/\\]\.mongocli\.json$", "MongoDB CLI config"),
    (r"[/\\]\.dbshell$", "Database shell history"),

    # === Private Keys (Generic) ===
    (r"private[^/\\]*\.pem$", "Private PEM key"),
    (r"private[^/\\]*\.key$", "Private key file"),
    (r"[/\\][^/\\]*\.p12$", "PKCS12 certificate bundle"),
    (r"[/\\][^/\\]*\.pfx$", "PFX certificate bundle"),
    (r"[/\\][^/\\]*_rsa$", "RSA private key"),
    (r"[/\\][^/\\]*_ed25519$", "Ed25519 private key"),
    (r"[/\\][^/\\]*_ecdsa$", "ECDSA private key"),

    # === Platform-Specific ===
    (r"[/\\]\.gh[/\\]hosts\.yml$", "GitHub CLI credentials"),
    (r"[/\\]\.config[/\\]gh[/\\]hosts\.yml$", "GitHub CLI credentials"),
    (r"[/\\]\.config[/\\]hub$", "Hub CLI config"),
    (r"[/\\]\.gitconfig$", "Git config (may contain credentials)"),
    (r"[/\\]\.git-credentials$", "Git credentials file"),
    (r"[/\\]\.hgrc$", "Mercurial config"),
    (r"[/\\]\.svn[/\\]auth[/\\]", "SVN auth directory"),

    # === CI/CD ===
    (r"[/\\]\.travis\.yml$", "Travis CI config (may have encrypted secrets)"),
    (r"[/\\]\.circleci[/\\]config\.yml$", "CircleCI config"),

    # === Windows-Specific ===
    (r"AppData[/\\]Roaming[/\\]\.aws[/\\]credentials$", "Windows AWS credentials"),
    (r"AppData[/\\]Roaming[/\\]gcloud[/\\]credentials\.db$", "Windows GCP credentials"),
    (r"[/\\]NTUSER\.DAT$", "Windows user registry hive"),
    (r"[/\\]SAM$", "Windows SAM database"),
    (r"[/\\]SYSTEM$", "Windows SYSTEM registry"),
    (r"[/\\]SECURITY$", "Windows SECURITY registry"),

    # === macOS-Specific (v1.3.6) ===
    (r"[/\\]Library[/\\]Keychains[/\\]", "macOS keychain files"),
    (r"[/\\]com\.apple\.TCC[/\\]TCC\.db$", "macOS privacy database"),
    (r"[/\\]Chrome[/\\].*[/\\]Login Data$", "Chrome saved passwords"),
    (r"[/\\]Firefox[/\\].*[/\\]logins\.json$", "Firefox saved passwords"),
    (r"[/\\]etc[/\\]authorization$", "macOS authorization database"),
    (r"[/\\]var[/\\]db[/\\]dslocal[/\\]", "Directory services database"),
]

# === SENSITIVE READ PATTERNS (Warn only) ===

SENSITIVE_READ_PATTERNS = [
    # Config files that might have secrets
    (r"[/\\]config\.json$", "Config file (may contain secrets)"),
    (r"[/\\]config\.yaml$", "Config file (may contain secrets)"),
    (r"[/\\]config\.yml$", "Config file (may contain secrets)"),
    (r"[/\\]settings\.json$", "Settings file (may contain secrets)"),

    # Backup files of credentials
    (r"[/\\]\.env\.bak$", "Environment file backup"),
    (r"[/\\]\.env\.backup$", "Environment file backup"),
    (r"[/\\]credentials\.bak$", "Credentials backup"),

    # Files with suspicious names
    (r"password", "File with 'password' in name"),
    (r"secret", "File with 'secret' in name"),
    (r"token", "File with 'token' in name"),
    (r"api.?key", "File with 'apikey' in name"),
]

# === SAFE READ PATTERNS ===
# Explicit allowlist for common safe reads

SAFE_READ_PATTERNS = [
    # Documentation
    r"README\.md$",
    r"README\.rst$",
    r"README\.txt$",
    r"README$",
    r"CHANGELOG\.md$",
    r"CHANGELOG$",
    r"HISTORY\.md$",
    r"LICENSE$",
    r"LICENSE\.md$",
    r"LICENSE\.txt$",
    r"CONTRIBUTING\.md$",
    r"CODE_OF_CONDUCT\.md$",
    r"\.md$",
    r"\.rst$",
    r"\.txt$",

    # Source code
    r"\.py$",
    r"\.pyi$",
    r"\.js$",
    r"\.mjs$",
    r"\.cjs$",
    r"\.ts$",
    r"\.tsx$",
    r"\.jsx$",
    r"\.go$",
    r"\.rs$",
    r"\.java$",
    r"\.kt$",
    r"\.scala$",
    r"\.c$",
    r"\.cpp$",
    r"\.cc$",
    r"\.h$",
    r"\.hpp$",
    r"\.cs$",
    r"\.rb$",
    r"\.php$",
    r"\.swift$",
    r"\.m$",
    r"\.mm$",
    r"\.lua$",
    r"\.pl$",
    r"\.sh$",
    r"\.bash$",
    r"\.zsh$",
    r"\.fish$",
    r"\.ps1$",
    r"\.bat$",
    r"\.cmd$",
    r"\.sql$",
    r"\.graphql$",
    r"\.gql$",

    # Config (Non-Sensitive)
    r"package\.json$",
    r"package-lock\.json$",
    r"yarn\.lock$",
    r"pnpm-lock\.yaml$",
    r"tsconfig\.json$",
    r"jsconfig\.json$",
    r"pyproject\.toml$",
    r"setup\.py$",
    r"setup\.cfg$",
    r"Cargo\.toml$",
    r"Cargo\.lock$",
    r"go\.mod$",
    r"go\.sum$",
    r"requirements\.txt$",
    r"Pipfile$",
    r"Pipfile\.lock$",
    r"Gemfile$",
    r"Gemfile\.lock$",
    r"composer\.json$",
    r"composer\.lock$",
    r"Makefile$",
    r"CMakeLists\.txt$",
    r"\.gitignore$",
    r"\.dockerignore$",
    r"Dockerfile$",
    r"docker-compose\.yml$",
    r"docker-compose\.yaml$",

    # Example/Template Files (safe versions of .env)
    r"\.env\.example$",
    r"\.env\.template$",
    r"\.env\.sample$",
    r"\.env\.dist$",
    r"example\.",
    r"sample\.",
    r"template\.",

    # Web assets
    r"\.html$",
    r"\.css$",
    r"\.scss$",
    r"\.sass$",
    r"\.less$",
    r"\.svg$",

    # Data formats (generic - but config.json handled by SENSITIVE)
    r"\.xml$",
]


# === LOGGING ===

def log_decision(file_path: str, verdict: str, reason: str, layer: str):
    """Log security decision to audit file."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": "Read",
            "file_path": file_path[:500],  # Truncate very long paths
            "verdict": verdict,
            "reason": reason,
            "layer": layer
        }
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except (IOError, OSError) as e:
        print(f"Warning: Could not write to audit log: {e}", file=sys.stderr)


# === PATH NORMALIZATION ===

def normalize_path(file_path: str, cwd: str) -> str:
    """
    Expand ~ and environment variables, resolve relative paths.
    Normalize to forward slashes for consistent pattern matching.
    """
    # Expand ~ to home directory
    expanded = os.path.expanduser(file_path)

    # Expand environment variables
    expanded = os.path.expandvars(expanded)

    # Resolve relative paths
    if not os.path.isabs(expanded):
        expanded = os.path.join(cwd, expanded)

    # Normalize path (resolve .., etc.)
    normalized = os.path.normpath(expanded)

    # Convert to forward slashes for consistent pattern matching
    normalized = normalized.replace("\\", "/")

    return normalized


# === PATTERN CHECKING ===

def check_dangerous_patterns(file_path: str) -> Tuple[bool, str]:
    """Check if file_path matches any dangerous pattern."""
    for pattern, reason in DANGEROUS_READ_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            return True, reason
    return False, ""


def check_sensitive_patterns(file_path: str) -> Tuple[bool, str]:
    """Check if file_path matches any sensitive pattern."""
    for pattern, reason in SENSITIVE_READ_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            return True, reason
    return False, ""


def check_safe_patterns(file_path: str) -> bool:
    """Check if file_path matches any safe pattern."""
    for pattern in SAFE_READ_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            return True
    return False


# === SKIP MECHANISM ===

def get_skip_count() -> int:
    """Get current skip count (0 if no skips remaining)."""
    if not SKIP_FILE.exists():
        return 0
    try:
        content = SKIP_FILE.read_text().strip()
        return int(content)
    except (ValueError, IOError, OSError):
        return 1  # Old format or error = treat as 1


def decrement_skip() -> Tuple[bool, int]:
    """
    Decrement the skip counter. Returns (was_skipped, remaining_count).
    Supports both old format (file exists = 1 skip) and new format (file contains count).
    """
    if not SKIP_FILE.exists():
        return False, 0

    try:
        content = SKIP_FILE.read_text().strip()
        try:
            count = int(content)
        except ValueError:
            count = 1  # Old format or invalid = treat as 1

        if count <= 1:
            # Last skip, remove the file
            try:
                SKIP_FILE.unlink()
            except (IOError, OSError):
                pass
            return True, 0
        else:
            # Decrement and save
            SKIP_FILE.write_text(str(count - 1))
            return True, count - 1
    except (IOError, OSError):
        return False, 0


def is_skip_enabled() -> bool:
    """Check if skip_next flag is set (legacy function, kept for compatibility)."""
    return SKIP_FILE.exists()


# === OUTPUT FUNCTIONS ===

def block(reason: str, file_path: str, pattern: str = ""):
    """
    Block a read using Claude Code's structured JSON output.

    Uses exit code 0 with permissionDecision: "deny" instead of exit code 2.
    This ensures consistent behavior between CLI and VS Code extension.
    """
    # Build the block reason message
    msg = f"🛑 BLOCKED: {reason}\nFile: {file_path}"
    if pattern:
        msg += f"\nPattern: {pattern}"
    msg += "\nUse '/hs skip' to bypass."

    # Output structured JSON for Claude Code to parse
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": msg
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def warn(reason: str, file_path: str):
    """Output warning message (currently just logs, doesn't block)."""
    print(f"\n⚠️  WARNING: {reason}", file=sys.stderr)
    print(f"File: {file_path}", file=sys.stderr)
    print("Proceeding with read...\n", file=sys.stderr)
    # In v1.3, warnings don't block - they just log


# === MAIN ===

def block_error(reason: str):
    """Block due to an error (fail-closed behavior) using JSON output."""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": f"🛑 BLOCKED (fail-closed): {reason}\nUse '/hs skip' to bypass."
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def main():
    """Main hook logic."""
    # Read hook input from stdin
    try:
        input_text = sys.stdin.read()
        input_data = json.loads(input_text)
    except json.JSONDecodeError as e:
        if FAIL_CLOSED:
            block_error(f"Failed to parse hook input: {e}")
        sys.exit(0)
    except Exception as e:
        if FAIL_CLOSED:
            block_error(f"Failed to read hook input: {e}")
        sys.exit(0)

    # Extract file path from tool input
    tool_input = input_data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")
    cwd = input_data.get("cwd", os.getcwd())

    # No path = allow (shouldn't happen, but defensive)
    if not file_path:
        sys.exit(0)

    # Normalize path for consistent matching
    normalized_path = normalize_path(file_path, cwd)

    # Debug log
    try:
        with open(DEBUG_FILE, "a") as f:
            f.write(f"  Original: {file_path}\n")
            f.write(f"  Normalized: {normalized_path}\n")
    except:
        pass

    # Check skip flag first
    if SKIP_FILE.exists():
        was_skipped, remaining = decrement_skip()
        if was_skipped:
            log_decision(normalized_path, "ALLOW", f"Skip (remaining: {remaining})", "skip")
            if remaining > 0:
                print(f"⏭️  Read check skipped ({remaining} skip{'s' if remaining > 1 else ''} remaining)", file=sys.stderr)
            else:
                print("⏭️  Read check skipped (last skip, protection resumed)", file=sys.stderr)
            sys.exit(0)

    # Check SAFE patterns first (fast path for common files)
    if check_safe_patterns(normalized_path):
        # Don't log safe reads to reduce noise
        sys.exit(0)

    # Check DANGEROUS patterns
    is_dangerous, reason = check_dangerous_patterns(normalized_path)
    if is_dangerous:
        log_decision(normalized_path, "BLOCK", reason, "pattern")
        block(reason, file_path, reason)

    # Check SENSITIVE patterns (warn only in v1.3)
    is_sensitive, reason = check_sensitive_patterns(normalized_path)
    if is_sensitive:
        log_decision(normalized_path, "WARN", reason, "pattern")
        warn(reason, file_path)
        sys.exit(0)  # Allow after warning

    # Default: allow reads not matching any pattern
    sys.exit(0)


if __name__ == "__main__":
    main()
