# Skill Bus Architecture

The skill for connecting skills. Wire context, conditions, and other skills into any skill invocation — declaratively, without modification.

## Architecture Flow

```mermaid
flowchart TD
    subgraph Trigger["1. Trigger"]
        User["User invokes skill<br/>(e.g. /superpowers:writing-plans)"]
        User --> Hook["Claude Code fires<br/>PreToolUse / PostToolUse hook"]
        UserSlash["User types /command"]
        UserSlash --> PromptHook["UserPromptSubmit hook<br/>(prompt-monitor.sh)"]
        PromptHook --> |"monitorSlashCommands<br/>enabled?"| FastPath
        Complete["Claude runs<br/>/skill-bus:complete {skill}"]
        Complete --> |"PreToolUse"| CompleteIntercept["dispatch.sh intercepts<br/>skill-bus:complete"]
        CompleteIntercept --> |"Chain depth < 5"| CompletePath["dispatcher.py<br/>--timing complete"]
        CompleteIntercept --> |"Chain depth >= 5"| DepthStop["STOP: depth limit"]
    end

    subgraph FastPath["2. Fast Path (~6ms)"]
        Hook --> ConfigCheck{Config files<br/>exist?}
        ConfigCheck --> |"No"| NudgeCheck{"First run?<br/>(.sb-nudged absent)"}
        NudgeCheck --> |"Yes"| Nudge["Emit nudge:<br/>/skill-bus:onboard"]
        NudgeCheck --> |"No"| Exit1["Exit (no output)"]
        ConfigCheck --> |"Yes"| NameCheck{"grep -qF skill name<br/>in configs?"}
        NameCheck --> |"No"| WildCheck{"Wildcard patterns<br/>in configs?"}
        WildCheck --> |"No"| Exit2["Exit (no output)"]
        NameCheck --> |"Yes"| SlowPath
        WildCheck --> |"Yes"| SlowPath
    end

    subgraph Config["3. Config Layer"]
        Global["~/.claude/skill-bus.json<br/>(global scope)"]
        Project[".claude/skill-bus.json<br/>(project scope)"]
        Global --> Merge["Merge configs<br/>(project wins on conflict)"]
        Project --> Merge
        Merge --> Inserts["Inserts<br/>(reusable text + conditions)"]
        Merge --> Subs["Subscriptions<br/>(insert + pattern + timing)"]
        Merge --> Settings["Settings<br/>(enabled, maxMatches, etc.)"]
    end

    subgraph SlowPath["4. Slow Path (~20ms)"]
        SP1["dispatcher.py"] --> SP2{"Settings<br/>enabled?"}
        SP2 --> |"No"| Exit3["Exit (no output)"]
        SP2 --> |"Yes"| SP3["Match subscriptions<br/>fnmatch(skill, pattern)"]
        SP3 --> SP4{"Conditions<br/>pass?"}
        SP4 --> |"No (skip)"| SP5["Log skip<br/>(if showConditionSkips)"]
        SP4 --> |"Yes"| SP6["Collect insert text"]
        SP6 --> DynCheck{"Insert has<br/>dynamic handler?"}
        DynCheck --> |"Yes"| DynResolve["Resolve via handler<br/>(fallback to static text)"]
        DynCheck --> |"No"| SP7
        DynResolve --> SP7{"Under<br/>maxMatchesPerSkill?"}
        SP7 --> |"Yes"| SP8["Build output"]
        SP7 --> |"No"| SP9["Warn + truncate"]
        SP9 --> SP8
    end

    subgraph Output["5. Injection"]
        SP8 --> Envelope["hookSpecificOutput JSON<br/>{hookEventName, additionalContext}"]
        Envelope --> Claude["Claude receives:<br/>skill content + injected context"]
    end

    Subs --> SP3
    Inserts --> SP6
    Settings --> SP2
```

## Condition Evaluation

```mermaid
flowchart LR
    subgraph Conditions["AND-Stacked Evaluation"]
        IC["Insert conditions<br/>(inherited by default)"] --> |"All pass?"| SC["Subscription conditions"]
        SC --> |"All pass?"| Fire["Subscription fires"]
        IC --> |"Any fail"| Skip1["Short-circuit skip"]
        SC --> |"Any fail"| Skip2["Short-circuit skip"]
    end

    subgraph Types["Condition Types"]
        T1["fileExists<br/>Path exists in CWD"]
        T2["gitBranch<br/>Glob match on branch"]
        T3["envSet<br/>Env var defined + non-empty"]
        T4["envEquals<br/>Env var == value"]
        T5["fileContains<br/>Literal or regex in file"]
        T6["not<br/>Negate any condition"]
    end
```

## Config Merge Model

```mermaid
flowchart LR
    subgraph Merge["Config Resolution"]
        D["Defaults"] --> G["Global config"]
        G --> P["Project config"]
        P --> Final["Merged result"]
    end

    subgraph Rules["Merge Rules"]
        R1["Settings: cascade override<br/>(defaults → global → project)"]
        R2["Inserts: name collision = project wins<br/>(INFO logged)"]
        R3["Subscriptions: dedup by<br/>(insert, on, when) tuple<br/>project wins"]
        R4["Overrides: project can disable<br/>global subs with enabled: false"]
    end
```

## Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Fast-path dispatcher | `hooks/dispatch.sh` | Bash grep filter (~6ms), avoids Python when no match possible |
| Pre-skill hook | `hooks/pre-skill.sh` | Entry point for PreToolUse events |
| Post-skill hook | `hooks/post-skill.sh` | Entry point for PostToolUse events |
| Prompt monitor | `hooks/prompt-monitor.sh` | Optional UserPromptSubmit hook for slash commands |
| Core dispatcher | `lib/dispatcher.py` | Config loading, condition eval, pattern matching, output building |
| Telemetry | `lib/telemetry.py` | JSONL event logging (`match`, `condition_skip`, `no_match`), log rotation |
| CLI | `lib/cli.py` | `list`, `simulate`, `skills`, `status`, `inserts`, `stats`, `scan`, `set`, `add-insert` subcommands |
| Onboard command | `commands/onboard.md` | Guided setup flow — discover knowledge, create subscriptions, configure settings |
| Session reflection | `skills/reflecting-on-sessions/SKILL.md` | Natural-break-point review of telemetry data and subscription gaps |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Master kill switch |
| `maxMatchesPerSkill` | `3` | Max subscriptions per skill invocation |
| `showConsoleEcho` | `true` | Show match info in console |
| `disableGlobal` | `false` | Ignore global config entirely |
| `monitorSlashCommands` | `false` | Enable prompt monitor for slash commands |
| `showConditionSkips` | `false` | Log condition-based skips |
| `telemetry` | `false` | Enable JSONL telemetry logging |
| `observeUnmatched` | `false` | Log skills with no matching subscriptions |
| `telemetryPath` | `""` | Override telemetry log path |
| `completionHooks` | `false` | *(Experimental)* Enable synthetic completion hooks |
| `maxLogSizeKB` | `512` | Max telemetry log size before rotation |

## Completion Flow (Experimental)

```mermaid
flowchart LR
    subgraph CompletionChain["Completion Chain"]
        Pre["Pre-hook fires for skill X"] --> Inject["Auto-inject: you MUST run<br/>/skill-bus:complete X --depth N"]
        Inject --> Work["Claude does skill X's work"]
        Work --> Signal["Claude runs<br/>/skill-bus:complete X"]
        Signal --> Intercept["dispatch.sh intercepts<br/>(PreToolUse)"]
        Intercept --> Python["dispatcher.py<br/>--timing complete"]
        Python --> Match["Match when:complete subs<br/>for skill X"]
        Match --> Fire["Inject downstream text"]
    end

    subgraph PromptBridge["Prompt-Bridge Path"]
        UserCmd["User types /skill-X"] --> Monitor["prompt-monitor.sh<br/>(UserPromptSubmit)"]
        Monitor --> PromptInject["Same completion instruction<br/>injected via prompt path"]
    end
```

**Requirements:** `completionHooks: true` in settings. Prompt-bridge also requires `monitorSlashCommands: true`.

## Gotchas

- Hook timeout is 5s — if Python dispatch exceeds this, skill loads without injected context
- Fast-path grep may have false positives (skill name substring match) — slow path handles precision
- Insert name collision across scopes — project version wins (INFO logged)
- `not` condition warns on double negation (likely a mistake)
- `fileContains` skips files > 1MB to avoid timeout
- `envEquals` warns if value is numeric (should be string: `"3000"` not `3000`)
