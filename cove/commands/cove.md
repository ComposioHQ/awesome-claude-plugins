---
description: Run Chain-of-Verification (CoVe) validation on a claim, output, plan, or code change.
argument-hint: [what to verify] [quick|thorough]
---

Apply the Chain-of-Verification (CoVe) framework to rigorously validate the following target:

$ARGUMENTS

Use the `cove` skill's 4-step process:

1. **Identify the Draft** — state concisely what is being verified. If `$ARGUMENTS` is empty, verify the most recent substantive claim, plan, or code change in this conversation.
2. **Generate Verification Questions** — decompose into 3-7 specific, independent, falsifiable sub-claims, each with how to check it.
3. **Answer Each Question Independently** — actually run the checks (read files, run commands, query the system). Report raw evidence and a verdict (CONFIRMED / REFUTED / INCONCLUSIVE) for each. Do not reason from memory.
4. **Synthesize Verified Output** — produce a VERIFICATION SUMMARY and a RESULT of VERIFIED, REFUTED (with the corrected version), or PARTIAL (with what's still uncertain).

**Depth:** if `$ARGUMENTS` contains "quick" or "shallow", limit to 3 questions on the highest-risk assumptions. If it contains "thorough" or "deep", expand to 5-7 questions including edge cases and second-order effects. Otherwise scale to complexity.
