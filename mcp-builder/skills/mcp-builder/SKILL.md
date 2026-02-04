---
name: mcp-builder
description: Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK).
---

# MCP Server Development Guide

## Overview

To create high-quality MCP (Model Context Protocol) servers that enable LLMs to effectively interact with external services, use this skill. An MCP server provides tools that allow LLMs to access external services and APIs.

## High-Level Workflow

Creating a high-quality MCP server involves four main phases:

### Phase 1: Deep Research and Planning

#### Agent-Centric Design Principles

**Build for Workflows, Not Just API Endpoints:**
- Don't simply wrap existing API endpoints - build thoughtful, high-impact workflow tools
- Consolidate related operations (e.g., `schedule_event` that both checks availability and creates event)
- Focus on tools that enable complete tasks, not just individual API calls

**Optimize for Limited Context:**
- Agents have constrained context windows - make every token count
- Return high-signal information, not exhaustive data dumps
- Provide "concise" vs "detailed" response format options
- Default to human-readable identifiers over technical codes

**Design Actionable Error Messages:**
- Error messages should guide agents toward correct usage patterns
- Suggest specific next steps: "Try using filter='active_only' to reduce results"
- Make errors educational, not just diagnostic

#### Study MCP Protocol Documentation

**Fetch the latest MCP protocol documentation:**
Use WebFetch to load: `https://modelcontextprotocol.io/llms-full.txt`

**For Python implementations:**
- Python SDK: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`

**For Node/TypeScript implementations:**
- TypeScript SDK: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`

### Phase 2: Implementation

#### Set Up Project Structure

**For Python:**
- Create a single `.py` file or organize into modules if complex
- Use the MCP Python SDK for tool registration
- Define Pydantic models for input validation

**For Node/TypeScript:**
- Create proper project structure
- Set up `package.json` and `tsconfig.json`
- Use MCP TypeScript SDK
- Define Zod schemas for input validation

#### Implement Core Infrastructure First

Create shared utilities before implementing tools:
- API request helper functions
- Error handling utilities
- Response formatting functions (JSON and Markdown)
- Pagination helpers
- Authentication/token management

#### Implement Tools Systematically

For each tool:

**Define Input Schema:**
- Use Pydantic (Python) or Zod (TypeScript) for validation
- Include proper constraints (min/max length, regex patterns)
- Provide clear, descriptive field descriptions

**Write Comprehensive Docstrings:**
- One-line summary of what the tool does
- Detailed explanation of purpose and functionality
- Explicit parameter types with examples
- Complete return type schema
- Usage examples

**Add Tool Annotations:**
- `readOnlyHint`: true (for read-only operations)
- `destructiveHint`: false (for non-destructive operations)
- `idempotentHint`: true (if repeated calls have same effect)
- `openWorldHint`: true (if interacting with external systems)

### Phase 3: Review and Refine

#### Code Quality Review

Review the code for:
- **DRY Principle**: No duplicated code between tools
- **Composability**: Shared logic extracted into functions
- **Consistency**: Similar operations return similar formats
- **Error Handling**: All external calls have error handling
- **Type Safety**: Full type coverage
- **Documentation**: Every tool has comprehensive docstrings

### Phase 4: Create Evaluations

Create comprehensive evaluations to test MCP server effectiveness.

Each evaluation question must be:
- **Independent**: Not dependent on other questions
- **Read-only**: Only non-destructive operations required
- **Complex**: Requiring multiple tool calls and deep exploration
- **Realistic**: Based on real use cases
- **Verifiable**: Single, clear answer that can be verified

## Best Practices Summary

1. Build for workflows, not just API endpoints
2. Optimize for limited context windows
3. Design actionable error messages
4. Follow natural task subdivisions
5. Use evaluation-driven development
6. Study framework documentation thoroughly
7. Implement core infrastructure first
8. Add proper tool annotations
9. Test with realistic scenarios
