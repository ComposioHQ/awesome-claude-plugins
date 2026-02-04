---
name: developer-growth-analysis
description: Analyzes your recent Claude Code chat history to identify coding patterns, development gaps, and areas for improvement, curates relevant learning resources from HackerNews, and automatically sends a personalized growth report to your Slack DMs.
---

# Developer Growth Analysis

This skill provides personalized feedback on your recent coding work by analyzing your Claude Code chat interactions and identifying patterns that reveal strengths and areas for growth.

## When to Use This Skill

Use this skill when you want to:
- Understand your development patterns and habits from recent work
- Identify specific technical gaps or recurring challenges
- Discover which topics would benefit from deeper study
- Get curated learning resources tailored to your actual work patterns
- Track improvement areas across your recent projects

## What This Skill Does

This skill performs a six-step analysis of your development work:

1. **Reads Your Chat History**: Accesses your local Claude Code chat history from the past 24-48 hours
2. **Identifies Development Patterns**: Analyzes the types of problems you're solving, technologies you're using, and challenges you encounter
3. **Detects Improvement Areas**: Recognizes patterns that suggest skill gaps or areas where you might benefit from deeper knowledge
4. **Generates a Personalized Report**: Creates a comprehensive report showing your work summary, identified improvement areas, and specific recommendations
5. **Finds Learning Resources**: Curates high-quality articles and discussions directly relevant to your improvement areas
6. **Delivers the Report**: Sends the complete report to your Slack DMs for easy reference

## How to Use

Ask Claude to analyze your recent coding work:

```
Analyze my developer growth from my recent chats
```

Or be more specific about which time period:

```
Analyze my work from today and suggest areas for improvement
```

## Report Structure

The skill generates a formatted report with:

### Work Summary
2-3 paragraphs summarizing what you worked on, projects touched, technologies used, and overall focus areas.

### Improvement Areas (Prioritized)

For each improvement area:
- **Why This Matters**: Explanation of why this skill is important
- **What Was Observed**: Specific evidence from chat history
- **Recommendation**: Concrete steps to improve
- **Time to Skill Up**: Brief estimate of effort required

### Strengths Observed
Bullet points highlighting things you're doing well

### Action Items
Priority-ordered list of actionable improvements

### Learning Resources
Curated articles from HackerNews relevant to each improvement area

## Example Improvement Areas

- "Advanced TypeScript patterns (generics, utility types, type guards) - you struggled with type safety in [specific project]"
- "Error handling and validation - I noticed you patched several bugs related to missing null checks"
- "Async/await patterns - your recent work shows some race conditions and timing issues"
- "Database query optimization - you rewrote the same query multiple times"

## Tips and Best Practices

- Run this analysis once a week to track your improvement trajectory over time
- Pick one improvement area at a time and focus on it for a few days
- Use the learning resources as a study guide
- Revisit this report after focusing on an area to see how your work patterns change
- The learning resources are curated for your actual work, not generic topics
