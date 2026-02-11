#!/usr/bin/env python3
"""
Hardstop Plugin — PreToolUse Hook (Bash)

Two-layer protection:
  Layer 1: Pattern matching (instant)
  Layer 2: Claude CLI analysis (within subscription)

Exit codes:
  0 = Success (uses JSON output for allow/deny decision)

Blocking uses permissionDecision: "deny" in JSON output instead of exit code 2.
This ensures consistent behavior between CLI and VS Code extension.

Design principle: Fail-closed. If safety check fails, block the command.
"""

import sys
import json
import re
import subprocess
import os
import shlex
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Tuple, Optional, List

# DEBUG: Write to file to confirm hook is being invoked
DEBUG_FILE = Path.home() / ".hardstop" / "hook_debug.log"
try:
    DEBUG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DEBUG_FILE, "a") as f:
        f.write(f"[{datetime.now().isoformat()}] Hook invoked\n")
except:
    pass

# === CONFIGURATION ===

STATE_DIR = Path.home() / ".hardstop"
STATE_FILE = STATE_DIR / "state.json"
SKIP_FILE = STATE_DIR / "skip_next"
LOG_FILE = STATE_DIR / "audit.log"

# Fail-closed: if True, errors during safety check block the command
FAIL_CLOSED = True

# === PATTERNS ===

DANGEROUS_PATTERNS = [
    # === HOME/ROOT DELETION ===
    # Fixed: removed $ anchor to catch commands with trailing redirects/flags
    # But exclude echo/printf which just output strings
    (r"(?<!echo\s)(?<!echo ')(?<!echo \")rm\s+(-[^\s]*\s+)*(/home/|~/)", "Deletes home directory"),
    (r"(?<!echo\s)(?<!echo ')(?<!echo \")rm\s+(-[^\s]*\s+)*~(/[^/\s]+)?(\s|$|>|;|&|\|)", "Deletes home directory or subdirectory"),
    (r"(?<!echo\s)(?<!echo ')(?<!echo \")rm\s+(-[^\s]*\s+)*/(\s|$|>|;|&|\|)", "Deletes root filesystem"),

    # Variable expansion variants
    (r"(?<!echo\s)rm\s+(-[^\s]*\s+)*\$HOME", "Deletes home directory via $HOME"),
    (r"(?<!echo\s)rm\s+(-[^\s]*\s+)*\$\{HOME\}", "Deletes home directory via ${HOME}"),
    (r"(?<!echo\s)rm\s+(-[^\s]*\s+)*/home/\$USER", "Deletes user home via $USER"),
    (r"(?<!echo\s)rm\s+(-[^\s]*\s+)*/home/\$\{USER\}", "Deletes user home via ${USER}"),

    # === FORK BOMB ===
    (r":\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:", "Fork bomb — will crash system"),

    # === REVERSE SHELLS ===
    (r"bash\s+-i\s+>&\s*/dev/tcp/", "Reverse shell — remote access backdoor"),
    (r"nc\s+(-[^\s]*\s+)*-e\s+/bin/(ba)?sh", "Reverse shell via netcat"),
    (r"/dev/tcp/[^\s]+", "Network connection via /dev/tcp"),
    (r"mkfifo.*nc.*sh", "Reverse shell via named pipe"),
    (r"python.*socket.*connect.*exec", "Python reverse shell"),
    (r"perl.*socket.*exec", "Perl reverse shell"),

    # === CREDENTIAL EXFILTRATION ===
    # Fixed: \.ssh not \\.ssh (raw string escaping)
    (r"curl\s+.*(-d|--data|-F|--form)\s+.*(\.ssh|\.aws|\.config|\.gnupg)", "Exfiltrates credentials"),
    (r"wget\s+.*--post-(data|file)\s+.*(\.ssh|\.aws|\.config)", "Exfiltrates credentials"),
    (r"cat\s+.*(\.ssh/id_|\.aws/credentials|\.env)\s*\|", "Pipes credentials to another command"),
    (r"tar\s+.*\s+(\.ssh|\.aws|\.gnupg|\.config).*\|.*(nc|curl|wget)", "Archives and exfiltrates credentials"),
    (r"scp\s+.*(\.ssh|\.aws|\.config).*@", "Copies credentials to remote host"),
    # Generic: piping sensitive files to network tools
    (r"cat\s+~/\.(ssh|aws|gnupg)/.*\|\s*nc\s+", "Pipes credentials via netcat"),

    # === CREDENTIAL FILE READS (standalone, no pipe required) ===
    (r"cat\s+.*\.ssh/(id_rsa|id_ed25519|id_ecdsa|id_dsa)", "Reads SSH private key"),
    (r"cat\s+.*\.aws/credentials", "Reads AWS credentials"),
    (r"cat\s+.*\.kube/config", "Reads Kubernetes credentials"),
    (r"cat\s+.*\.docker/config\.json", "Reads Docker registry auth"),
    (r"cat\s+.*\.npmrc", "Reads npm credentials"),
    (r"cat\s+.*/etc/shadow", "Reads system password hashes"),
    (r"cat\s+.*\.netrc", "Reads plaintext HTTP credentials"),
    (r"cat\s+.*\.gnupg/", "Reads GPG private data"),
    (r"cat\s+.*\.git-credentials", "Reads Git credentials"),
    (r"cat\s+.*\.env(\s|$)", "Reads environment secrets"),

    # === DISK DESTRUCTION ===
    (r"dd\s+.*of=/dev/(sd[a-z]|nvme|xvd|vd[a-z])", "Overwrites disk directly"),
    # Fixed: match partition numbers like /dev/sda1
    (r"mkfs(\.[a-z0-9]+)?\s+.*/dev/(sd[a-z]|nvme|xvd|vd[a-z])", "Formats drive"),
    (r">\s*/dev/(sd[a-z]|nvme)", "Redirects to raw disk"),
    (r"shred\s+.*(/dev/|/home/|~/)", "Shreds disk or home directory"),

    # === ENCODED PAYLOAD EXECUTION ===
    (r"base64\s+-d.*\|\s*(ba)?sh", "Executes base64-encoded payload"),
    (r"echo\s+[A-Za-z0-9+/=]+\s*\|\s*base64\s+-d\s*\|\s*(ba)?sh", "Executes encoded payload"),
    (r"eval\s+.*\$\(.*base64", "Eval with base64 decode"),
    (r"python.*-c.*exec.*decode", "Python encoded execution"),

    # === CURL/WGET PIPE TO SHELL ===
    (r"curl\s+[^|]*\|\s*(ba)?sh", "Pipes URL content to shell"),
    # Fixed: more flexible wget pattern
    (r"wget\s+.*\|\s*(ba)?sh", "Pipes download to shell"),
    (r"curl\s+[^|]*\|\s*python", "Pipes URL content to Python"),

    # === SYSTEM DAMAGE ===
    (r"chmod\s+(-[^\s]*\s+)*777\s+/", "Sets world-writable on system root"),
    (r"chmod\s+(-[^\s]*\s+)*-R\s+777", "Recursively sets world-writable"),
    (r"chown\s+(-[^\s]*\s+)*-R\s+.*\s+/(?!home)", "Recursive chown on system directories"),

    # === HISTORY MANIPULATION ===
    (r">\s*~/\.bash_history", "Clears bash history"),
    # Note: alias patterns removed - too many false positives with legitimate aliases like:
    # alias ls='ls --color=auto', alias rm='rm -i', alias cd='cd && ls'

    # === CRON/SCHEDULED TASKS ===
    (r"crontab\s+-r", "Removes all cron jobs"),
    (r"echo.*\|\s*crontab", "Pipes to crontab (potential persistence)"),

    # === DANGEROUS SUDO ===
    (r"sudo\s+rm\s+(-[^\s]*\s+)*(/|/home|/etc|/usr|/var)", "Sudo delete on system paths"),
    (r"sudo\s+chmod\s+(-[^\s]*\s+)*777", "Sudo world-writable permission"),
    (r"sudo\s+dd\s+", "Sudo disk write"),

    # ============================================================
    # WINDOWS-SPECIFIC PATTERNS
    # ============================================================

    # === WINDOWS SYSTEM DELETION ===
    # rd /s /q (recursive delete) on system paths
    (r"rd\s+(/s|/q|\s)+\s*(C:\\|C:/|%SystemRoot%|%USERPROFILE%|%APPDATA%)", "Deletes Windows system/user directory"),
    (r"rmdir\s+(/s|/q|\s)+\s*(C:\\|C:/|%SystemRoot%|%USERPROFILE%)", "Deletes Windows system/user directory"),
    # del on system paths
    (r"del\s+(/[fqsa]|\s)+\s*(C:\\Windows|C:\\Users|%SystemRoot%)", "Deletes Windows system files"),
    # PowerShell Remove-Item
    (r"Remove-Item\s+.*-Recurse.*\s+(C:\\|C:/|~\\|\$env:)", "PowerShell recursive delete on system paths"),
    (r"rm\s+-r.*\s+(C:\\Windows|C:\\Users\\[^\\]+$|\$HOME)", "Deletes Windows system/user directory"),

    # === WINDOWS REGISTRY MANIPULATION ===
    (r"reg\s+delete\s+.*HKLM", "Deletes machine-wide registry keys"),
    (r"reg\s+delete\s+.*HKCU\\Software\\Microsoft\\Windows", "Deletes critical user registry keys"),
    (r"reg\s+add\s+.*\\Run\s+", "Adds registry run key (persistence)"),
    (r"Remove-ItemProperty.*Registry", "PowerShell registry deletion"),

    # === WINDOWS CREDENTIAL THEFT ===
    (r"cmdkey\s+/list", "Lists stored Windows credentials"),
    (r"vaultcmd\s+/list", "Lists Windows credential vault"),
    (r"mimikatz", "Credential dumping tool"),
    (r"sekurlsa", "Credential dumping (mimikatz module)"),
    (r"Get-Credential.*Export", "Exports Windows credentials"),
    (r"copy.*\\Windows\\System32\\config\\(SAM|SYSTEM)", "Copies Windows password database"),

    # === WINDOWS DISK/BOOT DESTRUCTION ===
    (r"format\s+[A-Za-z]:", "Formats Windows drive"),
    (r"diskpart", "Windows disk partition tool"),
    (r"bcdedit\s+/delete", "Deletes boot configuration"),
    (r"bootrec\s+/fixmbr", "Modifies master boot record"),

    # === WINDOWS FIREWALL/SECURITY ===
    (r"netsh\s+advfirewall\s+set\s+.*state\s+off", "Disables Windows firewall"),
    (r"netsh\s+firewall\s+set\s+opmode\s+disable", "Disables Windows firewall (legacy)"),
    (r"Set-MpPreference\s+-DisableRealtimeMonitoring", "Disables Windows Defender"),
    (r"sc\s+stop\s+WinDefend", "Stops Windows Defender service"),

    # === WINDOWS REVERSE SHELLS ===
    (r"powershell.*-e\s+[A-Za-z0-9+/=]{20,}", "Encoded PowerShell payload"),
    (r"powershell.*IEX.*\(New-Object.*Net\.WebClient\)", "PowerShell download cradle"),
    (r"powershell.*Invoke-WebRequest.*\|\s*iex", "PowerShell download and execute"),
    (r"certutil.*-urlcache.*-split.*-f", "Certutil download (LOLBin)"),
    (r"bitsadmin.*\/transfer", "BITSAdmin download (LOLBin)"),
    (r"mshta\s+http", "MSHTA remote execution"),
    (r"regsvr32\s+/s\s+/n\s+/u\s+/i:http", "Regsvr32 script execution (Squiblydoo)"),

    # === WINDOWS USER/ADMIN MANIPULATION ===
    (r"net\s+user\s+.*\s+/add", "Creates Windows user account"),
    (r"net\s+localgroup\s+administrators\s+.*\s+/add", "Adds user to administrators"),
    (r"net\s+user\s+administrator\s+/active:yes", "Enables built-in administrator"),

    # === WINDOWS SCHEDULED TASKS ===
    (r"schtasks\s+/create", "Creates scheduled task (persistence)"),
    (r"at\s+\d+:\d+", "Creates AT job (legacy scheduler)"),

    # === POWERSHELL EXECUTION POLICY BYPASS ===
    (r"Set-ExecutionPolicy\s+Bypass", "Bypasses PowerShell execution policy"),
    (r"powershell.*-ExecutionPolicy\s+Bypass", "Bypasses PowerShell execution policy"),
    (r"powershell.*-ep\s+bypass", "Bypasses PowerShell execution policy"),

    # === COMMAND SUBSTITUTION IN ARGUMENTS ===
    # Defense in depth: catch command substitution hiding dangerous commands
    # Use [^;&|]* to stop at chain operators (prevents matching across && boundaries)
    (r"\bcd\s+[^;&|]*(\$\(|`)", "cd with command substitution (potential code execution)"),

    # ============================================================
    # SHELL WRAPPER PATTERNS (detecting hidden dangerous commands)
    # ============================================================

    # bash -c / sh -c with dangerous payloads
    (r"\b(ba)?sh\s+-c\s+[\"'].*\brm\s+(-[^\s]*\s+)*-r", "Shell wrapper hiding recursive delete"),
    (r"\b(ba)?sh\s+-c\s+[\"'].*\bdd\s+.*of=/dev/", "Shell wrapper hiding disk write"),
    (r"\b(ba)?sh\s+-c\s+[\"'].*\bmkfs", "Shell wrapper hiding filesystem format"),
    (r"\b(ba)?sh\s+-c\s+[\"'].*\bcurl.*\|\s*(ba)?sh", "Shell wrapper hiding curl pipe to shell"),
    (r"\b(ba)?sh\s+-c\s+[\"'].*\bwget.*\|\s*(ba)?sh", "Shell wrapper hiding wget pipe to shell"),

    # sudo with shell wrappers
    (r"\bsudo\s+(ba)?sh\s+-c\s+[\"'].*\brm\s+(-[^\s]*\s+)*-r", "Sudo shell wrapper hiding recursive delete"),
    (r"\bsudo\s+(ba)?sh\s+-c\s+[\"'].*\bchmod\s+(-[^\s]*\s+)*777", "Sudo shell wrapper hiding chmod 777"),

    # env wrapper with dangerous commands
    (r"\benv\s+.*\brm\s+(-[^\s]*\s+)*-r", "Env wrapper with recursive delete"),

    # xargs / find -exec with dangerous commands
    (r"\bxargs\s+.*\brm\s+(-[^\s]*\s+)*-r", "xargs piping to recursive delete"),
    (r"\bfind\s+.*-exec\s+rm\s+(-[^\s]*\s+)*-r", "find -exec with recursive delete"),
    # Note: generic 'find -delete' removed - too common for legitimate cleanup like:
    # find . -name "*.tmp" -delete, find /tmp -mtime +7 -delete
    # Only block find -delete on dangerous paths:
    (r"\bfind\s+(~|/home|/|/etc|/usr|/var)\s+.*-delete", "find -delete on system/home paths"),

    # ============================================================
    # CLOUD CLI DESTRUCTIVE OPERATIONS
    # ============================================================

    # === AWS CLI ===
    (r"\baws\s+s3\s+rm\s+.*--recursive", "AWS S3 recursive delete"),
    (r"\baws\s+s3\s+rb\s+.*--force", "AWS S3 force remove bucket"),
    (r"\baws\s+ec2\s+terminate-instances\b", "AWS EC2 terminate instances"),
    (r"\baws\s+rds\s+delete-db-instance\b", "AWS RDS delete database"),
    (r"\baws\s+cloudformation\s+delete-stack\b", "AWS CloudFormation delete stack"),
    (r"\baws\s+dynamodb\s+delete-table\b", "AWS DynamoDB delete table"),
    (r"\baws\s+eks\s+delete-cluster\b", "AWS EKS delete cluster"),
    (r"\baws\s+lambda\s+delete-function\b", "AWS Lambda delete function"),
    (r"\baws\s+iam\s+delete-role\b", "AWS IAM delete role"),
    (r"\baws\s+iam\s+delete-user\b", "AWS IAM delete user"),

    # === GCP (gcloud) ===
    (r"\bgcloud\s+projects\s+delete\b", "GCP delete entire project"),
    (r"\bgcloud\s+compute\s+instances\s+delete\b", "GCP delete compute instance"),
    (r"\bgcloud\s+sql\s+instances\s+delete\b", "GCP delete SQL instance"),
    (r"\bgcloud\s+container\s+clusters\s+delete\b", "GCP delete GKE cluster"),
    (r"\bgcloud\s+storage\s+rm\s+.*-r", "GCP storage recursive delete"),
    (r"\bgcloud\s+functions\s+delete\b", "GCP delete Cloud Function"),
    (r"\bgcloud\s+iam\s+service-accounts\s+delete\b", "GCP delete service account"),

    # === FIREBASE ===
    (r"\bfirebase\s+projects:delete\b", "Firebase delete project"),
    (r"\bfirebase\s+firestore:delete\s+.*--all-collections", "Firebase delete all Firestore data"),
    (r"\bfirebase\s+database:remove\b", "Firebase delete Realtime DB"),
    (r"\bfirebase\s+functions:delete\b", "Firebase delete functions"),

    # === KUBERNETES (kubectl) ===
    (r"\bkubectl\s+delete\s+namespace\b", "Kubernetes delete namespace"),
    (r"\bkubectl\s+delete\s+all\s+--all", "Kubernetes delete all resources"),
    (r"\bkubectl\s+delete\s+.*--all\s+--all-namespaces", "Kubernetes delete across all namespaces"),
    (r"\bhelm\s+uninstall\b", "Helm uninstall release"),

    # === DOCKER ===
    (r"\bdocker\s+system\s+prune\s+.*-a", "Docker prune all unused data"),
    (r"\bdocker\s+volume\s+rm\b", "Docker remove volume (data loss)"),
    (r"\bdocker\s+volume\s+prune\b", "Docker prune volumes"),

    # === TERRAFORM / PULUMI ===
    (r"\bterraform\s+destroy\b", "Terraform destroy infrastructure"),
    (r"\bpulumi\s+destroy\b", "Pulumi destroy resources"),

    # === DATABASE CLI ===
    (r"\bredis-cli\s+FLUSHALL", "Redis flush all data"),
    (r"\bredis-cli\s+FLUSHDB", "Redis flush database"),
    (r"\bmongosh?.*dropDatabase", "MongoDB drop database"),
    (r"\bdropdb\b", "PostgreSQL drop database"),
    (r"\bmysqladmin\s+drop\b", "MySQL drop database"),

    # === OTHER PLATFORMS ===
    (r"\bvercel\s+remove\s+.*--yes", "Vercel remove deployment"),
    (r"\bvercel\s+projects\s+rm\b", "Vercel delete project"),
    (r"\bnetlify\s+sites:delete\b", "Netlify delete site"),
    (r"\bheroku\s+apps:destroy\b", "Heroku destroy app"),
    (r"\bheroku\s+pg:reset\b", "Heroku reset Postgres"),
    (r"\bfly\s+(apps\s+)?destroy\b", "Fly.io destroy app"),
    (r"\bgh\s+repo\s+delete\b", "GitHub delete repository"),
    (r"\bnpm\s+unpublish\b", "npm unpublish package"),

    # === SQL DESTRUCTIVE (without WHERE) ===
    (r"\bDELETE\s+FROM\s+\w+\s*;", "SQL DELETE without WHERE clause"),
    (r"\bDELETE\s+FROM\s+\w+\s*$", "SQL DELETE without WHERE clause"),
    (r"\bTRUNCATE\s+TABLE\b", "SQL TRUNCATE TABLE"),
    (r"\bDROP\s+TABLE\b", "SQL DROP TABLE"),
    (r"\bDROP\s+DATABASE\b", "SQL DROP DATABASE"),

    # ============================================================
    # MACOS-SPECIFIC PATTERNS (v1.3.6)
    # ============================================================

    # === DISK UTILITY ===
    (r"\bdiskutil\s+eraseDisk\b", "Erases entire macOS disk"),
    (r"\bdiskutil\s+eraseVolume\b", "Erases macOS volume"),
    (r"\bdiskutil\s+partitionDisk\b", "Repartitions macOS disk (data loss)"),
    (r"\bdiskutil\s+apfs\s+deleteContainer\b", "Deletes APFS container"),
    (r"\bdiskutil\s+secureErase\b", "Secure erases macOS disk"),
    (r"\bdiskutil\s+zeroDisk\b", "Writes zeros to macOS disk"),

    # === KEYCHAIN ACCESS ===
    (r"\bsecurity\s+delete-keychain\b", "Deletes macOS keychain"),
    (r"\bsecurity\s+dump-keychain\b", "Dumps macOS keychain contents"),
    (r"\bsecurity\s+find-generic-password\s+.*-w\b", "Extracts password from macOS keychain"),
    (r"\bsecurity\s+find-internet-password\s+.*-w\b", "Extracts internet password from keychain"),
    (r"\bsecurity\s+export\s+.*-k\b", "Exports macOS keychain"),

    # === TIME MACHINE ===
    (r"\btmutil\s+delete\b", "Deletes Time Machine backup"),
    (r"\btmutil\s+disable\b", "Disables Time Machine"),
    (r"\btmutil\s+deletelocalsnapshots\b", "Deletes local Time Machine snapshots"),
    (r"\brm\s+.*Backups\.backupdb", "Deletes Time Machine backup data"),

    # === DIRECTORY SERVICES ===
    (r"\bdscl\s+\.\s+-delete\s+/Users/", "Deletes macOS user account"),
    (r"\bdscl\s+\.\s+-delete\s+/Groups/", "Deletes macOS group"),
    (r"\bdscl\s+\.\s+-append\s+/Groups/admin\s+", "Adds user to admin group"),

    # === SYSTEM SECURITY ===
    (r"\bspctl\s+--master-disable\b", "Disables macOS Gatekeeper"),
    (r"\bcsrutil\s+disable\b", "Disables System Integrity Protection"),
    (r"\bsystemsetup\s+-setremotelogin\s+on\b", "Enables SSH/remote login"),
    (r"\bnvram\s+boot-args", "Modifies macOS boot arguments"),

    # === PRIVACY DATABASE ===
    (r"\bsqlite3\s+.*TCC\.db", "Direct access to macOS privacy database"),
    (r"\btccutil\s+reset\b", "Resets macOS privacy permissions"),

    # === PERSISTENCE ===
    (r"\blaunchctl\s+load\s+.*/Library/LaunchDaemons/", "Loads system daemon (persistence mechanism)"),
    (r"\blaunchctl\s+unload\s+.*com\.apple\.", "Unloads Apple system service"),
    (r"\bcp\s+.*\.plist\s+.*/Library/LaunchDaemons/", "Installs system daemon (persistence)"),
    (r"\bcp\s+.*\.plist\s+.*/Library/LaunchAgents/", "Installs launch agent (persistence)"),
    (r"\bmv\s+.*\.plist\s+.*/Library/Launch", "Moves plist to launch directory (persistence)"),

    # === APPLICATION DATA ===
    (r"\brm\s+.*~/Library/Application\\ Support/", "Deletes macOS application data"),
    (r"\brm\s+(-[^\s]*\s+)*-r.*~/Library/Preferences/", "Recursively deletes macOS preferences"),
    (r"\bdefaults\s+delete\s+(com\.apple\.|NSGlobalDomain)", "Deletes system preferences"),
]

SAFE_PATTERNS = [
    # Hardstop's own operations (must be able to manage itself)
    r"^python\s+.*[/\\]\.claude[/\\]plugins[/\\]hs[/\\].*\.py(?:\s+.*)?$",
    r"^python\s+.*\.hardstop.*$",
    r"^cat\s+.*\.hardstop[/\\].*$",
    r"^cat\s+.*\.claude[/\\]plugins[/\\]hs[/\\].*$",
    r"^rm\s+(-f\s+)?.*\.hardstop[/\\](skip_next|hook_debug\.log)$",
    r"^grep\s+.*\.claude[/\\]plugins[/\\]hs[/\\].*$",

    # Read-only operations
    r"^ls(?:\s+.*)?$",
    # cd with path - blocks command substitution $() and backticks
    # Allows: cd, cd /path, cd "path", cd 'path', cd ~/dir, cd ..
    # Blocks: cd $(cmd), cd `cmd`, cd ${var}$(cmd)
    r"^cd(?:\s+(?:\"[^`$()]*\"|'[^']*'|[^\s`$()]+))?$",
    # cat: allow reading files, but NOT credential paths (those are caught by DANGEROUS first)
    r"^cat\s+(?!.*(\.ssh/id_|\.aws/credentials|\.kube/config|\.docker/config\.json|\.npmrc|\.netrc|\.gnupg/|\.git-credentials|/etc/shadow|\.env$|\.env\s)).+$",
    r"^head\s+.+$",
    r"^tail\s+.+$",
    r"^less\s+.+$",
    r"^more\s+.+$",
    r"^pwd\s*$",
    r"^which\s+.+$",
    r"^type\s+.+$",
    r"^file\s+.+$",
    r"^wc\s+.+$",
    r"^grep\s+.+$",
    r"^find\s+.*\s-name\s+.*$",  # find with -name (read-only)
    r"^echo(?:\s+.*)?$",
    r"^date\s*$",
    r"^whoami\s*$",
    r"^hostname\s*$",
    r"^uname(?:\s+.*)?$",
    r"^env\s*$",
    r"^printenv(?:\s+.*)?$",
    
    # Git read operations
    r"^git\s+(status|log|diff|show|remote|describe|shortlog|whatchanged|rev-parse|rev-list|cat-file|ls-tree)(?:\s+.*)?$",
    r"^git\s+ls-[^\s]+(?:\s+.*)?$",

    # Git standard workflow (recoverable via reflog)
    # Excludes: reset (--hard loses uncommitted work), clean (deletes untracked), rebase --exec (runs shell)
    r"^git\s+(add|commit|push|pull|fetch|clone|stash|checkout|switch|restore|merge|cherry-pick|branch|tag|init|config|am|apply|bisect|blame|bundle|format-patch|gc|mv|notes|reflog|revert|rm|submodule|worktree)(?:\s+.*)?$",
    r"^git\s+rebase(?!\s+.*--exec)(?:\s+.*)?$",  # rebase allowed, but not with --exec
    
    # Regeneratable cleanup
    r"^rm\s+(-[^\s]*\s+)*node_modules/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*__pycache__/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*\.venv/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*venv/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*\.pytest_cache/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*dist/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*build/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*\.next/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*\.nuxt/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*coverage/?\s*$",
    r"^rm\s+(-[^\s]*\s+)*(/tmp/|\$TMPDIR)\s*$",
    
    # Package managers (read/lock operations)
    r"^npm\s+(list|ls|outdated|audit|view)(?:\s+.*)?$",
    r"^pip\s+(list|show|freeze)(?:\s+.*)?$",
    r"^yarn\s+(list|outdated|why)(?:\s+.*)?$",

    # ============================================================
    # WINDOWS-SPECIFIC SAFE PATTERNS
    # ============================================================

    # Windows read-only operations
    r"^dir(?:\s+.*)?$",
    r"^type\s+.+$",
    r"^more\s+.+$",
    r"^where\s+.+$",
    r"^hostname\s*$",
    r"^whoami\s*$",
    r"^systeminfo\s*$",
    r"^ver\s*$",
    r"^set\s*$",  # Show environment variables

    # PowerShell read-only
    r"^Get-Content\s+.+$",
    r"^Get-ChildItem(?:\s+.*)?$",
    r"^Get-Location\s*$",
    r"^Get-Item\s+.+$",
    r"^Get-Process\s*$",
    r"^Get-Service\s*$",
    r"^\$PWD\s*$",

    # Windows cleanup (regeneratable)
    r"^rd\s+(/s|/q|\s)+\s*node_modules\s*$",
    r"^rd\s+(/s|/q|\s)+\s*__pycache__\s*$",
    r"^rd\s+(/s|/q|\s)+\s*\.venv\s*$",
    r"^rd\s+(/s|/q|\s)+\s*dist\s*$",
    r"^rd\s+(/s|/q|\s)+\s*build\s*$",
    r"^rmdir\s+(/s|/q|\s)+\s*node_modules\s*$",

    # ============================================================
    # MACOS-SPECIFIC SAFE PATTERNS (v1.3.6)
    # ============================================================

    # macOS read-only operations
    r"^diskutil\s+list\s*$",
    r"^diskutil\s+info\s+.+$",
    r"^system_profiler\s+.+$",
    r"^sw_vers\s*$",
    r"^defaults\s+read\s+.+$",
    r"^security\s+find-certificate\s+.+$",
    r"^tmutil\s+listbackups\s*$",
    r"^tmutil\s+status\s*$",
    r"^launchctl\s+list\s*$",
    r"^dscl\s+\.\s+-read\s+.+$",
    r"^spctl\s+--status\s*$",
]

# === LLM PROMPT ===

LLM_PROMPT = '''You are a security analyzer for a development environment. Assess command safety.

RESPOND WITH JSON ONLY — no markdown, no prose:
{{"verdict": "ALLOW" | "BLOCK", "reason": "one line explanation"}}

BLOCK if the command:
- Deletes user data (not regeneratable caches like node_modules, dist, build)
- Reads/exfiltrates credentials (.ssh keys, .aws, .env, API keys)
- Sends sensitive data externally (curl -d with credentials, scp ~/.ssh)
- Overwrites disk devices (dd of=/dev/*, format C:)
- Disables security (firewall off, antivirus disabled)
- Executes encoded payloads (base64 -d | sh, powershell -e)
- Creates persistence (cron jobs, registry Run keys, startup scripts)

ALLOW if the command:
- Git operations (push, pull, commit, fetch, clone, branch, tag, merge, rebase)
- Package managers (npm, pip, cargo, yarn, go, gem, composer)
- Build/test tools (make, pytest, jest, cargo build, tsc, webpack)
- Directory navigation (cd to any path)
- File operations in project directories
- Docker/container operations
- Read-only system queries (ls, cat, grep, find, ps, env)

IMPORTANT: This is a development assistant. Standard development workflows should be
ALLOWED unless they match a specific BLOCK criterion. Prefer ALLOW for recognized dev tools.

Command: {command}
Working directory: {cwd}

JSON response:'''


# === LOGGING ===

def log_decision(command: str, verdict: str, reason: str, layer: str, cwd: str):
    """Log security decision to audit file."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": "Bash",
            "command": command[:500],  # Truncate very long commands
            "cwd": cwd,
            "verdict": verdict,
            "reason": reason,
            "layer": layer
        }
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except (IOError, OSError) as e:
        # Logging failure shouldn't block operation
        print(f"Warning: Could not write to audit log: {e}", file=sys.stderr)


# === STATE MANAGEMENT ===

def load_state() -> dict:
    """Load plugin state. Returns default if file missing or corrupted."""
    default_state = {"enabled": True}
    try:
        if STATE_FILE.exists():
            content = STATE_FILE.read_text()
            state = json.loads(content)
            # Validate expected fields exist and have correct types
            if not isinstance(state.get("enabled"), bool):
                state["enabled"] = True
            # Back-compat: older versions stored skip_next in state.json.
            # skip_next is now tracked via SKIP_FILE for atomicity.
            return {"enabled": state.get("enabled", True)}
    except json.JSONDecodeError as e:
        print(f"Warning: Corrupted state file, using defaults: {e}", file=sys.stderr)
    except (IOError, OSError) as e:
        print(f"Warning: Could not read state file: {e}", file=sys.stderr)
    return default_state


def save_state(state: dict):
    """Save plugin state."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        # Only persist durable state (enabled). skip is tracked via SKIP_FILE.
        payload = json.dumps({"enabled": bool(state.get("enabled", True))}, indent=2)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            delete=False,
            dir=str(STATE_DIR),
            prefix="state.",
            suffix=".tmp",
        ) as tf:
            tf.write(payload)
            tmp_path = tf.name
        os.replace(tmp_path, STATE_FILE)
    except (IOError, OSError) as e:
        print(f"Warning: Could not save state: {e}", file=sys.stderr)


def decrement_skip() -> bool:
    """
    Decrement the skip counter. Returns True if skip was consumed.
    Supports both old format (file exists = 1 skip) and new format (file contains count).
    """
    if not SKIP_FILE.exists():
        return False

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
        else:
            # Decrement and save
            SKIP_FILE.write_text(str(count - 1))

        return True
    except (IOError, OSError):
        return False


def get_skip_count() -> int:
    """Get current skip count (0 if no skips remaining)."""
    if not SKIP_FILE.exists():
        return 0
    try:
        content = SKIP_FILE.read_text().strip()
        return int(content)
    except (ValueError, IOError, OSError):
        return 1  # Old format or error = treat as 1


def clear_skip():
    """Clear all skip flags (legacy function, kept for compatibility)."""
    try:
        SKIP_FILE.unlink(missing_ok=True)
    except TypeError:
        # Python < 3.8 compatibility for missing_ok
        try:
            if SKIP_FILE.exists():
                SKIP_FILE.unlink()
        except (IOError, OSError):
            pass
    except (IOError, OSError):
        pass


# === COMMAND PARSING ===

def split_chained_commands(command: str) -> List[str]:
    """
    Split a command string into individual commands for separate analysis.
    Handles &&, ||, ;, and | (pipes).

    Note: This is a simplified parser. Complex shell constructs may not be
    perfectly handled, which is intentional — unknown constructs should be
    analyzed more carefully, not less.
    """
    # First, try to identify obvious chaining patterns
    # We handle: cmd1 && cmd2, cmd1 || cmd2, cmd1 ; cmd2, cmd1 | cmd2

    commands = []
    current = ""
    i = 0
    in_quotes = False
    quote_char = None

    while i < len(command):
        char = command[i]

        # Track quote state
        if char in ('"', "'") and (i == 0 or command[i-1] != '\\'):
            if not in_quotes:
                in_quotes = True
                quote_char = char
            elif char == quote_char:
                in_quotes = False
                quote_char = None

        # Only split on operators outside quotes
        if not in_quotes:
            # Check for && or ||
            if i < len(command) - 1:
                two_char = command[i:i+2]
                if two_char in ('&&', '||'):
                    if current.strip():
                        commands.append(current.strip())
                    current = ""
                    i += 2
                    continue

            # Check for ; or |
            if char in (';', '|'):
                if current.strip():
                    commands.append(current.strip())
                current = ""
                i += 1
                continue

        current += char
        i += 1

    # Add final command
    if current.strip():
        commands.append(current.strip())

    return commands if commands else [command]


# === PATTERN MATCHING ===

def check_dangerous(command: str) -> Tuple[bool, Optional[str]]:
    """Check against dangerous patterns. Returns (matched, message)."""
    for pattern, message in DANGEROUS_PATTERNS:
        try:
            if re.search(pattern, command, re.IGNORECASE):
                return True, message
        except re.error as e:
            # Log regex errors but don't crash
            print(f"Warning: Invalid regex pattern '{pattern}': {e}", file=sys.stderr)
    return False, None


def check_safe(command: str) -> bool:
    """Check against safe patterns."""
    command = command.strip()
    for pattern in SAFE_PATTERNS:
        try:
            # Conservative: safe patterns must match the ENTIRE command string
            # (prevents substring-based bypasses).
            if re.fullmatch(pattern, command, re.IGNORECASE):
                return True
        except re.error as e:
            print(f"Warning: Invalid regex pattern '{pattern}': {e}", file=sys.stderr)
    return False


def _build_claude_exec(claude_path: str, args: List[str]) -> List[str]:
    """Build an executable command for claude CLI across platforms."""
    import platform

    if platform.system() == "Windows":
        lower = claude_path.lower()
        if lower.endswith((".cmd", ".bat")):
            return ["cmd", "/c", claude_path, *args]
    return [claude_path, *args]


def check_all_commands(command: str) -> Tuple[bool, Optional[str]]:
    """
    Check a potentially chained command.
    Splits on &&, ||, ;, | and checks each part.
    Returns (is_dangerous, message) - dangerous if ANY part is dangerous.
    """
    parts = split_chained_commands(command)

    for part in parts:
        is_dangerous, message = check_dangerous(part)
        if is_dangerous:
            return True, f"{message} (in chained command)"

    return False, None


def is_all_safe(command: str) -> bool:
    """
    Check if ALL parts of a chained command are safe.
    Returns True only if every part matches a safe pattern.

    v1.3.4: Now splits chained commands and checks each part individually.
    This allows safe chains like "cd /tmp && git push" to fast-path.
    """
    stripped = command.strip()
    if not stripped:
        return True

    # Split into parts and check each one
    parts = split_chained_commands(stripped)

    # All parts must match a safe pattern
    for part in parts:
        if not check_safe(part):
            return False

    return True


# === LLM ANALYSIS ===

def find_claude_cli() -> Optional[str]:
    """Find claude CLI executable."""
    import shutil
    import platform

    # First check if 'claude' is in PATH (safest, uses system resolution)
    claude_in_path = shutil.which("claude")
    if claude_in_path:
        return claude_in_path

    # Check common installation locations as fallback
    candidates = []

    if platform.system() == "Windows":
        # Windows paths
        appdata = os.environ.get("APPDATA", "")
        localappdata = os.environ.get("LOCALAPPDATA", "")
        candidates = [
            str(Path.home() / "AppData" / "Roaming" / "npm" / "claude.cmd"),
            str(Path.home() / "AppData" / "Local" / "npm" / "claude.cmd"),
            str(Path.home() / ".npm-global" / "claude.cmd"),
            str(Path(appdata) / "npm" / "claude.cmd") if appdata else "",
            str(Path(localappdata) / "npm" / "claude.cmd") if localappdata else "",
            # Scoop installation
            str(Path.home() / "scoop" / "shims" / "claude.cmd"),
        ]
        candidates = [c for c in candidates if c]  # Filter empty
    else:
        # Unix paths (macOS/Linux)
        candidates = [
            "/usr/local/bin/claude",
            str(Path.home() / ".local/bin/claude"),
            str(Path.home() / ".npm-global/bin/claude"),
            # Homebrew on macOS
            "/opt/homebrew/bin/claude",
        ]

    for candidate in candidates:
        try:
            candidate_path = Path(candidate)
            if candidate_path.exists() and candidate_path.is_file():
                result = subprocess.run(
                    _build_claude_exec(candidate, ["--version"]),
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return candidate
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, OSError):
            continue

    return None


def parse_llm_response(response: str) -> Tuple[str, str]:
    """
    Parse LLM response, handling various formats.
    Returns (verdict, reason).
    """
    response = response.strip()

    # Try to extract JSON, handling markdown fencing
    json_str = response

    # Remove markdown code fences if present
    if "```" in response:
        # Try to find JSON block
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try to find any JSON object (handles nested braces)
            brace_count = 0
            start_idx = None
            for i, char in enumerate(response):
                if char == '{':
                    if start_idx is None:
                        start_idx = i
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0 and start_idx is not None:
                        json_str = response[start_idx:i+1]
                        break

    try:
        data = json.loads(json_str)
        verdict = str(data.get("verdict", "")).upper()
        reason = str(data.get("reason", ""))

        if verdict in ("ALLOW", "BLOCK"):
            return verdict, reason
    except json.JSONDecodeError:
        pass

    # JSON parsing failed — use keyword detection
    # In fail-closed mode, unknown = BLOCK
    upper = response.upper()
    if "BLOCK" in upper:
        return "BLOCK", "Flagged as dangerous (keyword match)"
    elif "ALLOW" in upper:
        return "ALLOW", "Permitted (keyword match)"

    # Could not determine verdict
    return "UNKNOWN", "Could not parse response"


def ask_claude(command: str, cwd: str) -> Tuple[str, str]:
    """
    Ask Claude to analyze command. Returns (verdict, reason).

    FAIL-CLOSED DESIGN:
    - If CLI unavailable: BLOCK (not ALLOW)
    - If timeout: BLOCK (not ALLOW)
    - If parse error: BLOCK (not ALLOW)

    This ensures safety check failures don't silently allow dangerous commands.
    """
    claude_path = find_claude_cli()

    if not claude_path:
        if FAIL_CLOSED:
            return "BLOCK", "Safety CLI unavailable — blocking for safety (use /hs skip to bypass)"
        else:
            return "ALLOW", "(CLI unavailable, pattern-only mode)"

    prompt = LLM_PROMPT.format(command=command, cwd=cwd)

    try:
        result = subprocess.run(
            _build_claude_exec(claude_path, ["--print", "--model", "haiku"]),
            input=prompt,
            capture_output=True,
            text=True,
            timeout=15,
            shell=False
        )

        if result.returncode != 0:
            if FAIL_CLOSED:
                return "BLOCK", f"Safety CLI error (exit {result.returncode}) — blocking for safety"
            else:
                return "ALLOW", f"(CLI error {result.returncode}, allowing)"

        # Parse response
        verdict, reason = parse_llm_response(result.stdout)

        if verdict == "UNKNOWN":
            if FAIL_CLOSED:
                return "BLOCK", "Could not verify safety — blocking (use /hs skip to bypass)"
            else:
                return "ALLOW", "(Unparseable response, allowing)"

        return verdict, reason

    except subprocess.TimeoutExpired:
        if FAIL_CLOSED:
            return "BLOCK", "Safety check timed out — blocking for safety (use /hs skip to bypass)"
        else:
            return "ALLOW", "(Timeout, allowing)"

    except subprocess.SubprocessError as e:
        if FAIL_CLOSED:
            return "BLOCK", f"Safety check failed ({type(e).__name__}) — blocking for safety"
        else:
            return "ALLOW", f"(Error: {type(e).__name__}, allowing)"

    except OSError as e:
        if FAIL_CLOSED:
            return "BLOCK", f"Cannot run safety check ({e}) — blocking for safety"
        else:
            return "ALLOW", f"(OS Error: {e}, allowing)"


# === MAIN ===

def block_command(message: str, command: str, layer: str, cwd: str):
    """
    Block a command using Claude Code's structured JSON output.

    Uses exit code 0 with permissionDecision: "deny" instead of exit code 2.
    This ensures consistent behavior between CLI and VS Code extension.
    Exit code 2 causes VS Code to treat it as a session error and restart the chat.
    """
    log_decision(command, "BLOCK", message, layer, cwd)

    # Build the block reason message
    truncated_cmd = command[:100] + ('...' if len(command) > 100 else '')
    reason = f"🛑 BLOCKED: {message}\nCommand: {truncated_cmd}\nUse '/hs skip' to bypass."

    # Output structured JSON for Claude Code to parse
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def check_uninstall_script(command: str) -> bool:
    """
    Check if this is the Hardstop removal script.
    Returns True if blocked (shows custom message), False otherwise.
    """
    # Detect removal script execution
    removal_patterns = [
        r"uninstall\.ps1",
        r"uninstall\.sh",
    ]

    for pattern in removal_patterns:
        if re.search(pattern, command, re.IGNORECASE):
            reason = (
                "🗑️ HARDSTOP REMOVAL DETECTED\n"
                "You are about to remove Hardstop.\n"
                "This will remove: Plugin files, Skill config, Hooks\n"
                "To confirm: Run '/hs skip' then retry."
            )
            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason
                }
            }
            print(json.dumps(output))
            sys.exit(0)

    return False


def allow_command(reason: str, command: str, layer: str, cwd: str, silent: bool = False):
    """Allow a command and exit with code 0."""
    log_decision(command, "ALLOW", reason, layer, cwd)
    if not silent and reason and not reason.startswith("("):
        print(f"ℹ️  {reason}", file=sys.stderr)
    sys.exit(0)


def main():
    # Parse stdin from Claude Code
    try:
        context = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        if FAIL_CLOSED:
            print(f"\n🛑 BLOCKED: Could not parse command context ({e})\n", file=sys.stderr)
            print("Safety check cannot proceed. Use '/hs skip' if needed.\n", file=sys.stderr)
            sys.exit(2)
        else:
            sys.exit(0)

    tool_input = context.get("tool_input", {})
    command = tool_input.get("command", "")
    cwd = context.get("cwd", os.getcwd())

    if not command.strip():
        sys.exit(0)

    # Check state
    state = load_state()

    if not state.get("enabled", True):
        log_decision(command, "ALLOW", "Hardstop disabled", "disabled", cwd)
        sys.exit(0)

    if SKIP_FILE.exists():
        remaining = get_skip_count()
        decrement_skip()
        new_remaining = remaining - 1
        log_decision(command, "ALLOW", f"Skip ({remaining} -> {new_remaining} remaining)", "skip", cwd)
        if new_remaining > 0:
            print(f"⏭️  Safety check skipped ({new_remaining} skip{'s' if new_remaining > 1 else ''} remaining)", file=sys.stderr)
        else:
            print("⏭️  Safety check skipped (last skip, protection resumed)", file=sys.stderr)
        sys.exit(0)

    # === SPECIAL CASE: Uninstall script detection ===
    # Show friendly confirmation message before generic blocking
    check_uninstall_script(command)

    # === LAYER 1: Pattern matching (instant) ===
    # Uses chained command detection to check ALL parts of piped/chained commands

    # Check dangerous patterns first (any part dangerous = block whole command)
    is_dangerous, danger_message = check_all_commands(command)
    if is_dangerous:
        block_command(danger_message, command, "pattern", cwd)

    # Check if ALL parts are safe patterns
    if is_all_safe(command):
        allow_command("Safe pattern match", command, "pattern", cwd, silent=True)

    # === LAYER 2: LLM analysis (unknown patterns) ===

    verdict, reason = ask_claude(command, cwd)

    if verdict == "BLOCK":
        block_command(reason, command, "llm", cwd)

    # ALLOW
    allow_command(reason, command, "llm", cwd)


if __name__ == "__main__":
    main()
