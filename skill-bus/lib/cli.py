#!/usr/bin/env python3
"""
Skill Bus CLI — deterministic config display, skill discovery, and simulation.

Subcommands:
    list                          Full subscription listing
    simulate SKILL --timing T     Per-condition pass/fail simulation
    skills                        Available skills/commands grouped by plugin
    status                        One-liner status
    inserts --scope S             Insert listing for a scope
    test-format-condition JSON    (hidden) Unit test helper

Imports config loading/merging from dispatcher.py (same directory).
"""

import json
import sys
import os
import argparse
import fnmatch
import re

# Import from dispatcher.py in the same directory
# Public API: load_config, merge_inserts, merge_configs, resolve_effective_conditions,
#             evaluate_condition, evaluate_conditions, DEFAULT_SETTINGS
# Private API (fragile, may change): _get_git_branch, _condition_cache, _warnings
_lib_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _lib_dir)
try:
    from dispatcher import (
        load_config, merge_inserts, merge_configs, resolve_effective_conditions,
        evaluate_condition, evaluate_conditions, DEFAULT_SETTINGS,
        _get_git_branch, _condition_cache, _warnings
    )
except ImportError as e:
    print(f"[skill-bus] CLI error: cannot import dispatcher.py from {_lib_dir}: {e}", file=sys.stderr)
    sys.exit(1)

try:
    from telemetry import resolve_telemetry_path, read_telemetry
except ImportError:
    resolve_telemetry_path = None
    read_telemetry = None


# ─── Warnings bridge ─────────────────────────────────────────────────────────

def get_and_clear_warnings():
    """Read and clear dispatcher's module-level _warnings list.

    dispatcher.py accumulates warnings in _warnings (malformed JSON, bad conditions, etc).
    We must read and surface them, then clear to prevent leaking between calls.
    """
    warnings = list(_warnings)
    _warnings.clear()
    return warnings


def print_warnings():
    """Print any accumulated dispatcher warnings to stderr."""
    for w in get_and_clear_warnings():
        print(w, file=sys.stderr)


# ─── Condition formatting ────────────────────────────────────────────────────

def format_condition(condition):
    """Render a single condition dict to human-readable string."""
    if not isinstance(condition, dict) or len(condition) != 1:
        return repr(condition)

    cond_type, cond_value = next(iter(condition.items()))

    if cond_type == "not":
        return f"not({format_condition(cond_value)})"
    if cond_type == "fileExists":
        return f'fileExists("{cond_value}")'
    if cond_type == "gitBranch":
        return f'gitBranch("{cond_value}")'
    if cond_type == "envSet":
        return f'envSet("{cond_value}")'
    if cond_type == "envEquals":
        if isinstance(cond_value, dict):
            var = cond_value.get("var", "?")
            val = cond_value.get("value", "?")
            return f'envEquals({var}, "{val}")'
        return f"envEquals({repr(cond_value)})"
    if cond_type == "fileContains":
        if isinstance(cond_value, dict):
            file = cond_value.get("file", "?")
            pattern = cond_value.get("pattern", "?")
            if cond_value.get("regex", False):
                return f'fileContains("{file}", /{pattern}/)'
            return f'fileContains("{file}", "{pattern}")'
        return f"fileContains({repr(cond_value)})"

    return f'{cond_type}({repr(cond_value)})'


def format_conditions(conditions):
    """Join multiple conditions with AND."""
    if not conditions:
        return "(none)"
    return " AND ".join(format_condition(c) for c in conditions)


# ─── Scope derivation (fixed: uses object identity, not tuple matching) ──────

def derive_scopes(subscriptions, global_config, project_config):
    """Derive scope for all merged subscriptions using dict object identity.

    merge_configs() preserves dict object references from the original config lists.
    After dedup, each surviving dict IS the same object as in either global_config or
    project_config subscriptions. We use id() to check which list it came from.

    This correctly handles the dedup case where project wins: the surviving dict is
    the project dict object even though the same (insert, on, when) tuple exists in global.
    """
    project_sub_ids = set()
    if project_config:
        for ps in project_config.get("subscriptions", []):
            if isinstance(ps, dict) and ps.get("enabled") is not False:
                project_sub_ids.add(id(ps))

    return {id(sub): ("project" if id(sub) in project_sub_ids else "global")
            for sub in subscriptions}


# ─── Config helpers ──────────────────────────────────────────────────────────

def load_configs(cwd):
    """Load global and project configs. Returns (global_config, project_config)."""
    global_path = os.environ.get("SKILL_BUS_GLOBAL_CONFIG", "~/.claude/skill-bus.json")
    project_path = os.path.join(cwd, ".claude", "skill-bus.json")
    return load_config(global_path), load_config(project_path)


def get_version():
    """Read version from plugin.json."""
    pjson = os.path.join(_lib_dir, "..", ".claude-plugin", "plugin.json")
    try:
        with open(pjson) as f:
            return json.load(f).get("version", "?")
    except (OSError, json.JSONDecodeError):
        return "?"


# ─── Override detection (fixed: shows overridden subs that merge_configs filters out) ─

def detect_overrides(project_config):
    """Extract override directives from project config.

    Returns:
        specific: set of (insert, on, when) tuples specifically disabled
        broad: set of insert names broadly disabled
    """
    specific = set()
    broad = set()
    if not project_config:
        return specific, broad
    for sub in project_config.get("subscriptions", []):
        if not isinstance(sub, dict):
            continue
        if sub.get("enabled") is False and "insert" in sub:
            if "on" in sub and "when" in sub:
                specific.add((sub["insert"], sub["on"], sub["when"]))
            else:
                broad.add(sub["insert"])
    return specific, broad


def get_overridden_global_subs(global_config, overrides_specific, overrides_broad):
    """Get global subs that are overridden (disabled) in project scope.

    These are NOT in the merged subscription list (merge_configs filters them),
    but we need them for the display to show "disabled in project" entries.
    """
    if not global_config:
        return []
    overridden = []
    for s in global_config.get("subscriptions", []):
        if not isinstance(s, dict):
            continue
        insert_name = s.get("insert", "")
        if insert_name in overrides_broad:
            overridden.append(s)
        elif (insert_name, s.get("on", ""), s.get("when", "pre")) in overrides_specific:
            overridden.append(s)
    return overridden


def detect_orphan_inserts(inserts_map, subscriptions, overridden_subs=None):
    """Find inserts not referenced by any subscription (including overridden ones)."""
    referenced = {s.get("insert") for s in subscriptions}
    if overridden_subs:
        referenced |= {s.get("insert") for s in overridden_subs}
    return [name for name in inserts_map if name not in referenced]


# ─── Subcommand: list ────────────────────────────────────────────────────────

def format_settings(settings, global_config, project_config):
    """Format the Skill Bus Status block."""
    lines = ["Skill Bus Status:"]

    g_enabled = "no config"
    if global_config:
        g_enabled = "enabled" if global_config.get("settings", {}).get("enabled", True) else "disabled"
    p_enabled = "no config"
    if project_config:
        p_enabled = "enabled" if project_config.get("settings", {}).get("enabled", True) else "disabled"

    lines.append(f"  Global:  {g_enabled}")
    lines.append(f"  Project: {p_enabled}")
    lines.append(f"  Max matches per skill: {settings.get('maxMatchesPerSkill', 3)}")
    lines.append(f"  Console echo: {'on' if settings.get('showConsoleEcho', True) else 'off'}")

    if settings.get("monitorSlashCommands", False):
        lines.append("  Slash command monitoring: ON")
    else:
        lines.append('  Slash command monitoring: off (enable with "monitorSlashCommands": true in settings)')

    lines.append(f"  Condition skip logging: {'on' if settings.get('showConditionSkips', False) else 'off'}")
    return "\n".join(lines)


def format_grouped_output(subscriptions, inserts_map, global_config, project_config, scopes):
    """Format subscriptions grouped by insert name with two-layer conditions.

    Includes overridden global subs (shown as "disabled in project") that merge_configs
    filtered out, so the user sees the complete picture.
    """
    overrides_specific, overrides_broad = detect_overrides(project_config)
    overridden_subs = get_overridden_global_subs(global_config, overrides_specific, overrides_broad)

    # Group active subs by insert name, preserving order
    groups = {}
    for sub in subscriptions:
        insert_name = sub.get("insert", "unnamed")
        if insert_name not in groups:
            groups[insert_name] = []
        groups[insert_name].append(("active", sub))

    # Add overridden subs to their groups
    for sub in overridden_subs:
        insert_name = sub.get("insert", "unnamed")
        if insert_name not in groups:
            groups[insert_name] = []
        groups[insert_name].append(("disabled", sub))

    if not groups:
        return "Subscriptions: (none)"

    lines = ["Subscriptions (grouped by insert):"]

    for insert_name, entries in groups.items():
        lines.append(f"\n  {insert_name}:")

        insert_def = inserts_map.get(insert_name, {})
        insert_conditions = insert_def.get("conditions", []) if isinstance(insert_def, dict) else []
        if insert_conditions:
            lines.append(f"    insert conditions: {format_conditions(insert_conditions)}")

        for status, sub in entries:
            pattern = sub.get("on", "?")
            timing = sub.get("when", "pre")

            if status == "disabled":
                lines.append(f"    -> {pattern} [{timing}] (global, disabled in project)")
                continue

            scope = scopes.get(id(sub), "unknown")
            lines.append(f"    -> {pattern} [{timing}] ({scope})")

            sub_conditions = sub.get("conditions", [])
            opt_out = sub.get("inheritConditions") is False

            if opt_out:
                lines.append("      inheritConditions: false (opts out of insert conditions)")
                if sub_conditions:
                    lines.append(f"      sub conditions: {format_conditions(sub_conditions)}")
                    lines.append(f"      effective: {format_conditions(sub_conditions)}")
                else:
                    lines.append("      effective: (none)")
            elif insert_conditions:
                if sub_conditions:
                    lines.append(f"      sub conditions: {format_conditions(sub_conditions)}")
                    effective = list(insert_conditions) + list(sub_conditions)
                    lines.append(f"      effective: {format_conditions(effective)}")
                else:
                    lines.append("      (no sub conditions)")
                    lines.append(f"      effective: {format_conditions(insert_conditions)}")
            elif sub_conditions:
                lines.append(f"      conditions: {format_conditions(sub_conditions)}")

    orphans = detect_orphan_inserts(inserts_map, subscriptions, overridden_subs)
    if orphans:
        lines.append(f"\n  Orphan inserts (no subscriptions): {', '.join(orphans)}")

    return "\n".join(lines)


def cmd_list(args):
    """Full subscription listing."""
    global_config, project_config = load_configs(args.cwd)
    settings, subscriptions = merge_configs(global_config, project_config)
    inserts_map, _ = merge_inserts(global_config, project_config)

    scopes = derive_scopes(subscriptions, global_config, project_config)

    print(format_settings(settings, global_config, project_config))
    print()
    print(format_grouped_output(subscriptions, inserts_map, global_config, project_config, scopes))
    print_warnings()


# ─── Subcommand: simulate ───────────────────────────────────────────────────

def condition_live_value(condition, cwd):
    """Get live value annotation for simulation display."""
    if not isinstance(condition, dict) or len(condition) != 1:
        return ""
    cond_type, cond_value = next(iter(condition.items()))
    if cond_type == "gitBranch":
        branch = _get_git_branch(cwd)
        return f" (current: {branch})" if branch else " (not in git repo)"
    if cond_type == "not":
        return condition_live_value(cond_value, cwd)
    return ""


def cmd_simulate(args):
    """Simulate matching with per-condition pass/fail."""
    _condition_cache.clear()
    get_and_clear_warnings()  # Clear any stale warnings

    global_config, project_config = load_configs(args.cwd)
    settings, subscriptions = merge_configs(global_config, project_config)
    inserts_map, _ = merge_inserts(global_config, project_config)

    skill_name = args.skill
    timing = args.timing
    lines = [f"Simulating: {skill_name} ({timing}) in {args.cwd}", ""]

    matched_any = False
    for sub in subscriptions:
        when = sub.get("when", "pre")
        if when != timing:
            continue
        pattern = sub.get("on", "")
        if not fnmatch.fnmatch(skill_name, pattern):
            continue

        matched_any = True
        insert_name = sub.get("insert", "unnamed")
        insert_def = inserts_map.get(insert_name, {})
        insert_conditions = insert_def.get("conditions", []) if isinstance(insert_def, dict) else []
        sub_conditions = sub.get("conditions", [])
        opt_out = sub.get("inheritConditions") is False

        lines.append(f"  {insert_name} -> {pattern} [{timing}]:")
        all_pass = True

        if insert_conditions and not opt_out:
            for cond in insert_conditions:
                for w in get_and_clear_warnings():
                    lines.append(f"    WARNING: {w}")
                result = evaluate_condition(cond, args.cwd)
                mark = "\u2713" if result else "\u2717"
                extra = condition_live_value(cond, args.cwd)
                lines.append(f"    insert: {format_condition(cond)} {mark}{extra}")
                if not result:
                    all_pass = False
                    lines.append("    (short-circuit: insert condition failed, sub conditions not evaluated)")
                    break
        elif opt_out and insert_conditions:
            lines.append("    insert: (opted out with inheritConditions: false)")

        if all_pass and sub_conditions:
            for cond in sub_conditions:
                for w in get_and_clear_warnings():
                    lines.append(f"    WARNING: {w}")
                result = evaluate_condition(cond, args.cwd)
                mark = "\u2713" if result else "\u2717"
                extra = condition_live_value(cond, args.cwd)
                lines.append(f"    sub: {format_condition(cond)} {mark}{extra}")
                if not result:
                    all_pass = False
                    lines.append("    (short-circuit: sub condition failed, remaining not evaluated)")
                    break

        if all_pass:
            text = insert_def.get("text", "") if isinstance(insert_def, dict) else ""
            lines.append(f"    -> fires (~{len(text) // 4} tokens)")
        else:
            lines.append("    -> skipped (conditions not met)")
        lines.append("")

    if not matched_any:
        lines.append(f"  No subscriptions match '{skill_name}' [{timing}]")

    print("\n".join(lines))
    print_warnings()


# ─── Subcommand: skills ──────────────────────────────────────────────────────

def parse_frontmatter_name(filepath):
    """Extract 'name' from YAML frontmatter. No PyYAML dependency."""
    try:
        with open(filepath, "r", errors="replace") as f:
            lines = f.readlines()
    except OSError:
        return None
    if not lines or lines[0].strip() != "---":
        return None
    for line in lines[1:]:
        if line.strip() == "---":
            break
        match = re.match(r'^name:\s*(.+)', line)
        if match:
            return match.group(1).strip().strip('"').strip("'")
    return None


def parse_semver_key(version_str):
    """Sort key for semver-like version strings. Falls back to lexicographic."""
    try:
        return [int(x) for x in version_str.split(".") if x.isdigit()]
    except (ValueError, AttributeError):
        return [version_str]


def scan_plugin_cache(cache_dir=None):
    """Scan plugin cache for skills and commands. Returns [(name, version, skills, commands)]."""
    if cache_dir is None:
        cache_dir = os.path.expanduser("~/.claude/plugins/cache")
    if not os.path.isdir(cache_dir):
        return []

    plugins = {}

    for source_name in sorted(os.listdir(cache_dir)):
        source_path = os.path.join(cache_dir, source_name)
        if not os.path.isdir(source_path) or source_name.startswith("temp_git_"):
            continue

        for plugin_dir_name in sorted(os.listdir(source_path)):
            plugin_path = os.path.join(source_path, plugin_dir_name)
            if not os.path.isdir(plugin_path):
                continue

            versions = sorted(os.listdir(plugin_path), key=parse_semver_key)
            if not versions:
                continue
            version_path = os.path.join(plugin_path, versions[-1])

            if os.path.exists(os.path.join(version_path, ".orphaned_at")):
                continue

            pjson_path = os.path.join(version_path, ".claude-plugin", "plugin.json")
            plugin_name = plugin_dir_name
            version = versions[-1]
            if os.path.isfile(pjson_path):
                try:
                    with open(pjson_path) as f:
                        pdata = json.load(f)
                    plugin_name = pdata.get("name", plugin_dir_name)
                    version = pdata.get("version", versions[-1])
                except (json.JSONDecodeError, OSError):
                    pass

            skills = []
            skills_dir = os.path.join(version_path, "skills")
            if os.path.isdir(skills_dir):
                for sd in sorted(os.listdir(skills_dir)):
                    sm = os.path.join(skills_dir, sd, "SKILL.md")
                    if os.path.isfile(sm):
                        skills.append(parse_frontmatter_name(sm) or sd)

            commands = []
            cmds_dir = os.path.join(version_path, "commands")
            if os.path.isdir(cmds_dir):
                for cf in sorted(os.listdir(cmds_dir)):
                    if cf.endswith(".md"):
                        commands.append(cf[:-3])

            if skills or commands:
                existing = plugins.get(plugin_name)
                if existing and (len(existing[1]) + len(existing[2])) >= (len(skills) + len(commands)):
                    continue
                plugins[plugin_name] = (version, skills, commands)

    return [(n, d[0], d[1], d[2]) for n, d in sorted(plugins.items())]


def scan_standalone_skills(base_dir):
    """Scan a skills/ directory for SKILL.md files."""
    if not os.path.isdir(base_dir):
        return []
    skills = []
    for item in sorted(os.listdir(base_dir)):
        sm = os.path.join(base_dir, item, "SKILL.md")
        if os.path.isfile(sm):
            skills.append(parse_frontmatter_name(sm) or item)
        nested = os.path.join(base_dir, item, "public")
        if os.path.isdir(nested):
            for sub in sorted(os.listdir(nested)):
                sub_md = os.path.join(nested, sub, "SKILL.md")
                if os.path.isfile(sub_md):
                    skills.append(parse_frontmatter_name(sub_md) or sub)
    return skills


def scan_commands_dir(base_dir):
    """Scan a commands/ directory for .md files."""
    if not os.path.isdir(base_dir):
        return []
    return [f[:-3] for f in sorted(os.listdir(base_dir)) if f.endswith(".md")]


def cmd_skills(args):
    """Enumerate available skills and commands."""
    lines = ["Available skills and commands:", ""]

    for name, version, skills, commands in scan_plugin_cache(args.cache_dir):
        ver_str = f" (v{version})" if version else ""
        lines.append(f"  Plugin: {name}{ver_str}")
        if skills:
            lines.append(f"    Skills: {', '.join(skills)}")
        if commands:
            lines.append(f"    Commands: {', '.join(commands)}")
        lines.append("")

    user_skills = scan_standalone_skills(os.path.expanduser("~/.claude/skills"))
    if user_skills:
        lines.append(f"  User skills (global):")
        lines.append(f"    {', '.join(user_skills)}")
        lines.append("")

    user_cmds = scan_commands_dir(os.path.expanduser("~/.claude/commands"))
    if user_cmds:
        lines.append(f"  User commands (global):")
        lines.append(f"    {', '.join(user_cmds)}")
        lines.append("")

    project_skills = scan_standalone_skills(os.path.join(args.cwd, ".claude", "skills"))
    if project_skills:
        lines.append(f"  Project skills:")
        lines.append(f"    {', '.join(project_skills)}")
        lines.append("")

    project_cmds = scan_commands_dir(os.path.join(args.cwd, ".claude", "commands"))
    if project_cmds:
        lines.append(f"  Project commands:")
        lines.append(f"    {', '.join(project_cmds)}")
        lines.append("")

    lines.append('  Or enter a glob pattern (e.g. "superpowers:*")')
    print("\n".join(lines))


# ─── Subcommand: status ──────────────────────────────────────────────────────

def cmd_status(args):
    """Quick one-liner status."""
    global_config, project_config = load_configs(args.cwd)
    settings, subscriptions = merge_configs(global_config, project_config)
    inserts_map, _ = merge_inserts(global_config, project_config)

    version = get_version()
    status = "enabled" if settings.get("enabled", True) else "PAUSED"
    scopes = derive_scopes(subscriptions, global_config, project_config)
    g_count = sum(1 for s in subscriptions if scopes.get(id(s)) == "global")
    p_count = sum(1 for s in subscriptions if scopes.get(id(s)) == "project")
    monitor = "on" if settings.get("monitorSlashCommands", False) else "off"

    telem = "off"
    if settings.get("telemetry", False):
        telem = "on"
        if settings.get("observeUnmatched", False):
            telem += " (+unmatched)"

    parts = [
        f"Skill Bus v{version}: {status}",
        f"{len(subscriptions)} subs ({g_count} global, {p_count} project)",
        f"{len(inserts_map)} inserts",
        f"prompt-monitor: {monitor}",
        f"telemetry: {telem}"
    ]
    print(" | ".join(parts))
    print_warnings()


# ─── Subcommand: inserts ────────────────────────────────────────────────────

def cmd_inserts(args):
    """List inserts for a scope (used by add-sub Step 4, edit-insert Step 2, remove-sub Step 2)."""
    global_config, project_config = load_configs(args.cwd)
    config = global_config if args.scope == "global" else project_config

    if not config:
        print(f"No {args.scope} config found.")
        return

    scope_inserts = config.get("inserts", {})
    if not scope_inserts:
        print(f"No inserts in {args.scope} config.")
        return

    lines = [f"Available inserts ({args.scope}):", "  1. [Create new insert]"]
    for i, (name, insert_def) in enumerate(scope_inserts.items(), start=2):
        text = insert_def.get("text", "") if isinstance(insert_def, dict) else str(insert_def)
        preview = text[:60].replace("\n", " ")
        if len(text) > 60:
            preview += "..."
        conditions = insert_def.get("conditions", []) if isinstance(insert_def, dict) else []
        cond_str = f"\n     conditions: {format_conditions(conditions)}" if conditions else "\n     (no conditions)"
        lines.append(f'  {i}. {name} -- "{preview}"{cond_str}')

    print("\n".join(lines))
    print_warnings()


# ─── Subcommand: scan ───────────────────────────────────────────────────────

def scan_knowledge(cwd):
    """Scan for knowledge files and project context.

    Returns a dict with:
        knowledge: list of dicts {path, type, description}
        skills: list from scan_plugin_cache
        existing_subs: count of existing subscriptions
        existing_config: bool
        git_remote: str or None
    """
    knowledge = []

    # 1. CLAUDE.md (primary)
    claude_md = os.path.join(cwd, ".claude", "CLAUDE.md")
    if os.path.isfile(claude_md):
        knowledge.append({
            "path": ".claude/CLAUDE.md",
            "type": "project-context",
            "description": "Project context and conventions"
        })

    # 2. docs/ directory
    docs_dir = os.path.join(cwd, "docs")
    if os.path.isdir(docs_dir):
        doc_count = 0
        subdirs = []
        for item in sorted(os.listdir(docs_dir)):
            subpath = os.path.join(docs_dir, item)
            if os.path.isdir(subpath):
                sub_count = len([f for f in os.listdir(subpath) if os.path.isfile(os.path.join(subpath, f))])
                if sub_count > 0:
                    subdirs.append(f"docs/{item}/ ({sub_count} files)")
                    doc_count += sub_count
            elif os.path.isfile(subpath):
                doc_count += 1

        detail = ", ".join(subdirs) if subdirs else f"{doc_count} files"
        knowledge.append({
            "path": "docs/",
            "type": "documentation",
            "description": f"Documentation directory — {detail}"
        })

    # 3. README.md
    readme = os.path.join(cwd, "README.md")
    if os.path.isfile(readme):
        knowledge.append({
            "path": "README.md",
            "type": "project-context",
            "description": "Project README"
        })

    # 4. Build tooling
    build_files = [
        ("package.json", "Node.js project config"),
        ("tsconfig.json", "TypeScript config"),
        ("pyproject.toml", "Python project config"),
        ("Cargo.toml", "Rust project config"),
        ("go.mod", "Go module config"),
        ("Makefile", "Build automation"),
    ]
    for fname, desc in build_files:
        if os.path.isfile(os.path.join(cwd, fname)):
            knowledge.append({
                "path": fname,
                "type": "build-tooling",
                "description": desc
            })

    # 5. Git remote
    git_remote = None
    git_config = os.path.join(cwd, ".git", "config")
    if os.path.isfile(git_config):
        try:
            with open(git_config, "r", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("url = "):
                        url = line[6:].strip()
                        for prefix in ["https://github.com/", "git@github.com:"]:
                            if url.startswith(prefix):
                                remote = url[len(prefix):]
                                if remote.endswith(".git"):
                                    remote = remote[:-4]
                                git_remote = remote
                                break
                        if not git_remote:
                            git_remote = url
                        break
        except OSError:
            pass

    if git_remote:
        knowledge.append({
            "path": ".git/config",
            "type": "git-identity",
            "description": f"Git remote: {git_remote}"
        })

    # Check existing config
    global_config, project_config = load_configs(cwd)
    settings, subscriptions = merge_configs(global_config, project_config)

    # Discover skills
    skills = scan_plugin_cache()

    return {
        "knowledge": knowledge,
        "skills": skills,
        "existing_subs": len(subscriptions),
        "existing_config": project_config is not None or global_config is not None,
        "git_remote": git_remote,
        "settings": settings,
    }


def cmd_scan(args):
    """Scan project for knowledge files and context."""
    result = scan_knowledge(args.cwd)

    if args.json:
        output = {
            "knowledge": result["knowledge"],
            "skills_count": sum(len(s[2]) + len(s[3]) for s in result["skills"]),
            "plugins_count": len(result["skills"]),
            "existing_subs": result["existing_subs"],
            "existing_config": result["existing_config"],
            "git_remote": result["git_remote"],
        }
        print(json.dumps(output, indent=2))
        return

    lines = ["Skill Bus Project Scan", "=" * 40, ""]

    if result["knowledge"]:
        lines.append("Knowledge files found:")
        for k in result["knowledge"]:
            lines.append(f"  - {k['path']} — {k['description']}")
        lines.append("")
    else:
        lines.append("No knowledge files found.")
        lines.append("  Tip: Create docs/decisions/ to start capturing project context.")
        lines.append("")

    total_skills = sum(len(s[2]) for s in result["skills"])
    total_commands = sum(len(s[3]) for s in result["skills"])
    lines.append(f"Installed: {len(result['skills'])} plugins, {total_skills} skills, {total_commands} commands")
    lines.append("")

    if result["existing_config"]:
        lines.append(f"Existing config: {result['existing_subs']} existing subscription(s)")
    else:
        lines.append("No existing config found.")

    print("\n".join(lines))
    print_warnings()


# ─── Subcommand: set ─────────────────────────────────────────────────────────

BOOLEAN_SETTINGS = {
    "enabled", "showConsoleEcho", "disableGlobal", "monitorSlashCommands",
    "showConditionSkips", "telemetry", "observeUnmatched", "completionHooks"
}
INTEGER_SETTINGS = {"maxMatchesPerSkill", "maxLogSizeKB"}
INTEGER_MIN = {"maxMatchesPerSkill": 1, "maxLogSizeKB": 0}
STRING_SETTINGS = {"telemetryPath"}
VALID_SETTINGS = BOOLEAN_SETTINGS | INTEGER_SETTINGS | STRING_SETTINGS


def parse_setting_value(key, value_str):
    """Parse a setting value string to the correct type."""
    if key in BOOLEAN_SETTINGS:
        if value_str.lower() in ("true", "1", "yes", "on"):
            return True
        if value_str.lower() in ("false", "0", "no", "off"):
            return False
        raise ValueError(f"Boolean setting '{key}' requires true/false, got '{value_str}'")
    if key in INTEGER_SETTINGS:
        try:
            val = int(value_str)
        except ValueError:
            raise ValueError(f"Integer setting '{key}' requires a number, got '{value_str}'")
        minimum = INTEGER_MIN.get(key, 1)
        if val < minimum:
            raise ValueError(f"Integer setting '{key}' must be >= {minimum}, got {val}")
        return val
    return value_str


def cmd_set(args):
    """Set a config setting value."""
    key = args.key
    value_str = args.value

    if key not in VALID_SETTINGS:
        print(f"Unknown setting: '{key}'", file=sys.stderr)
        print(f"Valid settings: {', '.join(sorted(VALID_SETTINGS))}", file=sys.stderr)
        sys.exit(1)

    try:
        value = parse_setting_value(key, value_str)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    if args.scope == "global":
        config_path = os.environ.get("SKILL_BUS_GLOBAL_CONFIG", "~/.claude/skill-bus.json")
        config_path = os.path.expanduser(config_path)
    else:
        config_path = os.path.join(args.cwd, ".claude", "skill-bus.json")

    raw_config = load_config(config_path)
    warnings = get_and_clear_warnings()
    if raw_config is None and any("invalid JSON" in w for w in warnings):
        for w in warnings:
            print(w, file=sys.stderr)
        print("Fix the JSON syntax before modifying config.", file=sys.stderr)
        sys.exit(1)
    config = raw_config or {"inserts": {}, "subscriptions": []}

    if "settings" not in config:
        config["settings"] = {}

    config["settings"][key] = value

    parent = os.path.dirname(config_path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    print(f"Set {key} = {json.dumps(value)} in {args.scope} config")

    if key == "observeUnmatched" and value is True:
        existing = config["settings"].get("telemetry", False)
        if not existing:
            print("  Note: observeUnmatched requires telemetry to be enabled", file=sys.stderr)

    print_warnings()


# ─── Subcommand: add-insert ──────────────────────────────────────────────────

def cmd_add_insert(args):
    """Add an insert definition and its subscription to config."""
    name = args.name
    text = args.text
    skill_pattern = args.on
    timing = args.when

    if args.scope == "global":
        config_path = os.environ.get("SKILL_BUS_GLOBAL_CONFIG", "~/.claude/skill-bus.json")
        config_path = os.path.expanduser(config_path)
    else:
        config_path = os.path.join(args.cwd, ".claude", "skill-bus.json")

    raw_config = load_config(config_path)
    warnings = get_and_clear_warnings()
    if raw_config is None and any("invalid JSON" in w for w in warnings):
        for w in warnings:
            print(w, file=sys.stderr)
        print("Fix the JSON syntax before modifying config.", file=sys.stderr)
        sys.exit(1)
    config = raw_config or {"inserts": {}, "subscriptions": []}

    inserts = config.setdefault("inserts", {})
    subs = config.setdefault("subscriptions", [])

    # If insert already exists and no --text provided, reuse existing
    if text is None:
        if name in inserts:
            insert_def = inserts[name]
        else:
            print(f"Error: --text is required when creating a new insert '{name}'", file=sys.stderr)
            sys.exit(1)
    else:
        if name in inserts:
            # Preserve existing conditions/dynamic, only update text
            insert_def = inserts[name].copy()
            insert_def["text"] = text
        else:
            insert_def = {"text": text}

    if args.conditions:
        try:
            conditions = json.loads(args.conditions)
            if conditions:
                insert_def["conditions"] = conditions
        except json.JSONDecodeError as e:
            print(f"Invalid conditions JSON: {e}", file=sys.stderr)
            sys.exit(1)

    if args.dynamic:
        insert_def["dynamic"] = args.dynamic

    is_dup = any(
        s.get("insert") == name and s.get("on") == skill_pattern and s.get("when", "pre") == timing
        for s in subs
    )

    if is_dup:
        print(f"Subscription already exists: {name} -> {skill_pattern} [{timing}]", file=sys.stderr)
        return

    inserts[name] = insert_def
    subs.append({"insert": name, "on": skill_pattern, "when": timing})

    parent = os.path.dirname(config_path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    print(f"Created: {name} -> {skill_pattern} [{timing}] ({args.scope})")
    print_warnings()


# ─── Subcommand: stats ──────────────────────────────────────────────────────

def cmd_stats(args):
    """Stats — summarize telemetry data."""
    if read_telemetry is None:
        print("Telemetry module not available. Reinstall skill-bus to fix.")
        return

    global_config, project_config = load_configs(args.cwd)
    settings, _ = merge_configs(global_config, project_config)

    events = read_telemetry(args.cwd, settings, session_filter=args.session, days_filter=args.days)

    if not events:
        print("No telemetry data found.")
        if not settings.get("telemetry", False):
            print('  Telemetry is disabled. Enable with: "telemetry": true in settings.')
        return

    # Group by event type
    matches = [e for e in events if e.get("event") == "match"]
    skips = [e for e in events if e.get("event") == "condition_skip"]
    no_match = [e for e in events if e.get("event") == "no_match"]

    lines = ["Skill Bus Stats", "=" * 40]
    if args.days:
        lines.append(f"(last {args.days} days)")
    lines.append("")

    # Summary counts
    # "Skills intercepted" = unique skills that had at least one match
    matched_skills = set(m.get("skill", "?") for m in matches)
    lines.append(f"Skills intercepted: {len(matched_skills)}")
    lines.append(f"Inserts injected: {len(matches)}")
    lines.append("")

    # Top skills with per-insert hit rates
    if matches:
        lines.append("Top skills:")
        # Group matches by skill
        by_skill = {}
        for m in matches:
            skill = m.get("skill", "?")
            by_skill.setdefault(skill, []).append(m.get("insert", "?"))

        # Sort by invocation count (descending)
        for skill, inserts in sorted(by_skill.items(), key=lambda x: -len(x[1])):
            total_invocations = len(inserts)
            insert_counts = {}
            for ins in inserts:
                insert_counts[ins] = insert_counts.get(ins, 0) + 1
            insert_parts = []
            for ins, count in insert_counts.items():
                insert_parts.append(f"{ins} {count}/{total_invocations}")
            lines.append(f"  {skill} — {total_invocations}x ({', '.join(insert_parts)})")
        lines.append("")

    # Condition failures with detail
    lines.append(f"Condition skips: {len(skips)}")
    if skips:
        by_insert = {}
        for s in skips:
            insert = s.get("insert", "?")
            skill = s.get("skill", "?")
            key = (insert, skill)
            by_insert[key] = by_insert.get(key, 0) + 1
        for (insert, skill), count in by_insert.items():
            lines.append(f"  {insert} on {skill} ({count}x)")
    lines.append("")

    # No coverage
    lines.append(f"No coverage: {len(no_match)}")
    if no_match:
        by_skill = {}
        for n in no_match:
            skill = n.get("skill", "?")
            by_skill[skill] = by_skill.get(skill, 0) + 1
        for skill, count in sorted(by_skill.items(), key=lambda x: -x[1]):
            lines.append(f"  {skill} — {count}x")
    lines.append("")

    # Session info
    session_ids = set(e.get("sessionId", "?") for e in events)
    lines.append(f"Sessions: {len(session_ids)}")

    # Suggestions
    suggestions = []

    # 1. Skills with 3+ no-match events → suggest add-sub
    if no_match:
        no_match_by_skill = {}
        for n in no_match:
            skill = n.get("skill", "?")
            no_match_by_skill[skill] = no_match_by_skill.get(skill, 0) + 1
        for skill, count in sorted(no_match_by_skill.items(), key=lambda x: -x[1]):
            if count >= 3:
                suggestions.append(
                    f"  {skill} ran {count}x with no subscription. "
                    f"Consider: /skill-bus:add-sub"
                )

    # 2. Inserts with 3+ condition skips → suggest investigating
    if skips:
        skip_by_insert = {}
        for s in skips:
            insert = s.get("insert", "?")
            skip_by_insert[insert] = skip_by_insert.get(insert, 0) + 1
        for insert, count in sorted(skip_by_insert.items(), key=lambda x: -x[1]):
            if count >= 3:
                suggestions.append(
                    f"  {insert} skipped {count}x due to conditions. "
                    f"Run: cli.py simulate <skill> --cwd $PWD"
                )

    if suggestions:
        lines.append("")
        lines.append("Suggestions:")
        lines.extend(suggestions)

    print("\n".join(lines))
    print_warnings()


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Skill Bus CLI")
    subparsers = parser.add_subparsers(dest="command")

    # list
    p_list = subparsers.add_parser("list", help="Full subscription listing")
    p_list.add_argument("--cwd", default=os.getcwd())

    # simulate
    p_sim = subparsers.add_parser("simulate", help="Simulate matching")
    p_sim.add_argument("skill", help="Skill name to simulate")
    p_sim.add_argument("--timing", choices=["pre", "post", "complete"], default="pre")
    p_sim.add_argument("--cwd", default=os.getcwd())

    # skills
    p_skills = subparsers.add_parser("skills", help="Enumerate available skills")
    p_skills.add_argument("--cwd", default=os.getcwd())
    p_skills.add_argument("--cache-dir", default=None, help="Override plugin cache dir (for testing)")

    # status
    p_status = subparsers.add_parser("status", help="Quick status one-liner")
    p_status.add_argument("--cwd", default=os.getcwd())

    # inserts
    p_inserts = subparsers.add_parser("inserts", help="List inserts for a scope")
    p_inserts.add_argument("--scope", choices=["global", "project"], required=True)
    p_inserts.add_argument("--cwd", default=os.getcwd())

    # scan
    p_scan = subparsers.add_parser("scan", help="Scan project for knowledge files")
    p_scan.add_argument("--cwd", default=os.getcwd())
    p_scan.add_argument("--json", action="store_true", help="Machine-readable JSON output")

    # set
    p_set = subparsers.add_parser("set", help="Set a config setting")
    p_set.add_argument("key", help="Setting name")
    p_set.add_argument("value", help="Setting value")
    p_set.add_argument("--scope", choices=["global", "project"], required=True)
    p_set.add_argument("--cwd", default=os.getcwd())

    # add-insert
    p_add_insert = subparsers.add_parser("add-insert", help="Add insert + subscription")
    p_add_insert.add_argument("--name", required=True, help="Insert name")
    p_add_insert.add_argument("--text", help="Insert text content (required for new inserts, optional when adding to existing)")
    p_add_insert.add_argument("--on", required=True, help="Skill pattern to match")
    p_add_insert.add_argument("--when", choices=["pre", "post", "complete"], default="pre", help="Timing")
    p_add_insert.add_argument("--scope", choices=["global", "project"], required=True)
    p_add_insert.add_argument("--conditions", help="JSON array of condition objects")
    p_add_insert.add_argument("--dynamic", help="Dynamic handler name (e.g. session-stats)")
    p_add_insert.add_argument("--cwd", default=os.getcwd())

    # stats
    p_stats = subparsers.add_parser("stats", help="Telemetry stats summary")
    p_stats.add_argument("--cwd", default=os.getcwd())
    p_stats.add_argument("--session", default=None, help="Filter by session ID")
    p_stats.add_argument("--days", type=int, default=None, help="Only show events from the last N days")

    # test-format-condition (hidden, for unit tests)
    p_test = subparsers.add_parser("test-format-condition")
    p_test.add_argument("condition_json")

    args = parser.parse_args()

    if args.command == "list":
        cmd_list(args)
    elif args.command == "simulate":
        cmd_simulate(args)
    elif args.command == "skills":
        cmd_skills(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "inserts":
        cmd_inserts(args)
    elif args.command == "scan":
        cmd_scan(args)
    elif args.command == "set":
        cmd_set(args)
    elif args.command == "add-insert":
        cmd_add_insert(args)
    elif args.command == "stats":
        cmd_stats(args)
    elif args.command == "test-format-condition":
        print(format_condition(json.loads(args.condition_json)))
    else:
        parser.print_help()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[skill-bus] CLI error: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
