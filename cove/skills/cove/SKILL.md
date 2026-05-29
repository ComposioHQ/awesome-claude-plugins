---
name: cove
description: Chain-of-Verification validation for any claim, output, plan, or code change. Use when the user says "validate", "verify", "check this", "is this right", "CoVe", or when you need to rigorously verify correctness of something before presenting it as fact. Also use proactively before committing code, finalizing plans, or asserting factual claims that could be wrong.
---

Apply the Chain-of-Verification (CoVe) framework to rigorously validate a target claim, output, or artifact. CoVe works by generating independent verification questions and answering them without bias from the original draft, then synthesizing a verified result.

## When to use

- User explicitly asks to validate/verify something
- Before asserting factual claims about code, configs, or system state
- Before committing changes that depend on assumptions about existing behavior
- When a plan or analysis depends on multiple facts that could independently be wrong

## The 4-Step CoVe Process

### Step 1: Identify the Draft (the thing to verify)

State clearly what is being verified. This could be:
- A code change and its claimed behavior
- A factual claim about the codebase or system
- A plan's assumptions and dependencies
- An analysis or diagnosis

Format:
```
DRAFT: <concise statement of what's being verified>
```

### Step 2: Generate Verification Questions

Decompose the draft into independently verifiable sub-claims. For each, generate a specific question that, if answered, would confirm or refute that sub-claim.

The questions should be:
- **Specific** — answerable by reading code, running a command, or checking docs
- **Independent** — each question stands alone, not depending on answers to other questions
- **Falsifiable** — a wrong answer would actually change the conclusion
- **Covering** — together they cover the critical assumptions in the draft

Aim for 3-7 questions depending on complexity. Don't generate trivial questions that couldn't plausibly be wrong.

Format:
```
VERIFICATION QUESTIONS:
1. <question> → <how to check: file to read, command to run, API to call>
2. <question> → <how to check>
...
```

### Step 3: Answer Each Question Independently

Answer each verification question by actually doing the check — read the file, run the command, query the system. The key insight from CoVe: answer each question as if you haven't seen the draft. Don't let the original claim bias your observation.

For each question, report:
- The raw evidence (what you actually observed)
- The verdict: CONFIRMED / REFUTED / INCONCLUSIVE

Format:
```
VERIFICATION RESULTS:
1. <question>
   Evidence: <what you found>
   Verdict: CONFIRMED | REFUTED | INCONCLUSIVE

2. ...
```

### Step 4: Synthesize Verified Output

Based on the verification results, produce one of:

- **ALL CONFIRMED** → State confidence in the original draft, noting what was checked
- **ANY REFUTED** → Identify what's wrong, explain the discrepancy, and produce a corrected version
- **INCONCLUSIVE** → State what couldn't be verified and what additional information is needed

Format:
```
VERIFICATION SUMMARY:
- Checked: N questions
- Confirmed: X | Refuted: Y | Inconclusive: Z

RESULT: <VERIFIED | REFUTED | PARTIAL>

<If verified: brief confirmation>
<If refuted: what's wrong and the corrected version>
<If partial: what's uncertain and what to do next>
```

## Depth Control

If the request contains "quick" or "shallow": limit to 3 verification questions, prioritize the highest-risk assumptions.

If the request contains "thorough" or "deep": expand to 5-7 questions, include edge cases and second-order effects.

Default: use judgment based on complexity (simple claims get 3, multi-step plans get 5-7).

## Important

- Never skip Step 3 by reasoning from memory — actually run the checks. The whole point is that verification is grounded in observation, not inference.
- If a verification question requires running code or accessing a system you can't reach, say so explicitly rather than guessing.
- The independence property matters: when answering question 4, don't let your answer to question 2 influence you. Each check is fresh.
