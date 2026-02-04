/**
 * Agent Analyzer
 * Main orchestrator for agent prompt optimization analysis
 *
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const { agentPatterns } = require('./agent-patterns');

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Markdown file content
 * @returns {Object} { frontmatter, body }
 */
function parseMarkdownFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return { frontmatter: null, body: content };
  }

  const trimmed = content.trim();

  // Check if starts with ---
  if (!trimmed.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  // Find closing ---
  const lines = trimmed.split('\n');
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  // Parse frontmatter as simple key: value pairs
  const frontmatter = {};
  const fmLines = lines.slice(1, endIndex);

  for (const line of fmLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }

  // Body is everything after closing ---
  const body = lines.slice(endIndex + 1).join('\n');

  return { frontmatter, body };
}

/**
 * Analyze a single agent file
 * @param {string} agentPath - Path to agent markdown file
 * @param {Object} options - Analysis options
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @returns {Object} Analysis results
 */
function analyzeAgent(agentPath, options = {}) {
  const results = {
    agentName: path.basename(agentPath, '.md'),
    agentPath,
    frontmatter: null,
    structureIssues: [],
    toolIssues: [],
    xmlIssues: [],
    cotIssues: [],
    exampleIssues: [],
    antiPatternIssues: [],
    crossPlatformIssues: []
  };

  // Read file
  if (!fs.existsSync(agentPath)) {
    results.structureIssues.push({
      issue: 'File not found',
      file: agentPath,
      certainty: 'HIGH',
      patternId: 'file_not_found'
    });
    return results;
  }

  let content;
  try {
    content = fs.readFileSync(agentPath, 'utf8');
  } catch (err) {
    results.structureIssues.push({
      issue: `Failed to read file: ${err.message}`,
      file: agentPath,
      certainty: 'HIGH',
      patternId: 'read_error'
    });
    return results;
  }

  // Parse frontmatter
  const { frontmatter } = parseMarkdownFrontmatter(content);
  results.frontmatter = frontmatter;

  // Check for missing frontmatter
  const missingFmPattern = agentPatterns.missing_frontmatter;
  const missingFmResult = missingFmPattern.check(content);
  if (missingFmResult) {
    results.structureIssues.push({
      ...missingFmResult,
      file: agentPath,
      certainty: missingFmPattern.certainty,
      patternId: missingFmPattern.id
    });
  }

  // If frontmatter exists, check its fields
  if (frontmatter) {
    // Check for missing name
    const missingNamePattern = agentPatterns.missing_name;
    const missingNameResult = missingNamePattern.check(frontmatter);
    if (missingNameResult) {
      results.structureIssues.push({
        ...missingNameResult,
        file: agentPath,
        certainty: missingNamePattern.certainty,
        patternId: missingNamePattern.id
      });
    }

    // Check for missing description
    const missingDescPattern = agentPatterns.missing_description;
    const missingDescResult = missingDescPattern.check(frontmatter);
    if (missingDescResult) {
      results.structureIssues.push({
        ...missingDescResult,
        file: agentPath,
        certainty: missingDescPattern.certainty,
        patternId: missingDescPattern.id
      });
    }

    // Check for unrestricted tools
    const unrestrictedToolsPattern = agentPatterns.unrestricted_tools;
    const unrestrictedToolsResult = unrestrictedToolsPattern.check(frontmatter);
    if (unrestrictedToolsResult) {
      results.toolIssues.push({
        ...unrestrictedToolsResult,
        file: agentPath,
        certainty: unrestrictedToolsPattern.certainty,
        patternId: unrestrictedToolsPattern.id
      });
    }

    // Check for unrestricted Bash
    const unrestrictedBashPattern = agentPatterns.unrestricted_bash;
    const unrestrictedBashResult = unrestrictedBashPattern.check(frontmatter);
    if (unrestrictedBashResult) {
      results.toolIssues.push({
        ...unrestrictedBashResult,
        file: agentPath,
        filePath: agentPath,
        certainty: unrestrictedBashPattern.certainty,
        patternId: unrestrictedBashPattern.id
      });
    }
  }

  // Check for missing role
  const missingRolePattern = agentPatterns.missing_role;
  const missingRoleResult = missingRolePattern.check(content);
  if (missingRoleResult) {
    results.structureIssues.push({
      ...missingRoleResult,
      file: agentPath,
      filePath: agentPath,
      certainty: missingRolePattern.certainty,
      patternId: missingRolePattern.id
    });
  }

  // Check for missing output format
  const missingOutputPattern = agentPatterns.missing_output_format;
  const missingOutputResult = missingOutputPattern.check(content);
  if (missingOutputResult) {
    results.structureIssues.push({
      ...missingOutputResult,
      file: agentPath,
      certainty: missingOutputPattern.certainty,
      patternId: missingOutputPattern.id
    });
  }

  // Check for missing constraints
  const missingConstraintsPattern = agentPatterns.missing_constraints;
  const missingConstraintsResult = missingConstraintsPattern.check(content);
  if (missingConstraintsResult) {
    results.structureIssues.push({
      ...missingConstraintsResult,
      file: agentPath,
      certainty: missingConstraintsPattern.certainty,
      patternId: missingConstraintsPattern.id
    });
  }

  // Check for missing XML structure
  const missingXmlPattern = agentPatterns.missing_xml_structure;
  const missingXmlResult = missingXmlPattern.check(content);
  if (missingXmlResult && (options.verbose || missingXmlPattern.certainty !== 'LOW')) {
    results.xmlIssues.push({
      ...missingXmlResult,
      file: agentPath,
      certainty: missingXmlPattern.certainty,
      patternId: missingXmlPattern.id
    });
  }

  // Check for unnecessary CoT
  const unnecessaryCotPattern = agentPatterns.unnecessary_cot;
  const unnecessaryCotResult = unnecessaryCotPattern.check(content);
  if (unnecessaryCotResult && (options.verbose || unnecessaryCotPattern.certainty !== 'LOW')) {
    results.cotIssues.push({
      ...unnecessaryCotResult,
      file: agentPath,
      certainty: unnecessaryCotPattern.certainty,
      patternId: unnecessaryCotPattern.id
    });
  }

  // Check for missing CoT
  const missingCotPattern = agentPatterns.missing_cot;
  const missingCotResult = missingCotPattern.check(content);
  if (missingCotResult && (options.verbose || missingCotPattern.certainty !== 'LOW')) {
    results.cotIssues.push({
      ...missingCotResult,
      file: agentPath,
      certainty: missingCotPattern.certainty,
      patternId: missingCotPattern.id
    });
  }

  // Check example count
  const exampleCountPattern = agentPatterns.example_count_suboptimal;
  const exampleCountResult = exampleCountPattern.check(content);
  if (exampleCountResult && options.verbose) {
    results.exampleIssues.push({
      ...exampleCountResult,
      file: agentPath,
      certainty: exampleCountPattern.certainty,
      patternId: exampleCountPattern.id
    });
  }

  // Check for vague instructions
  const vaguePattern = agentPatterns.vague_instructions;
  const vagueResult = vaguePattern.check(content);
  if (vagueResult && (options.verbose || vaguePattern.certainty !== 'LOW')) {
    results.antiPatternIssues.push({
      ...vagueResult,
      file: agentPath,
      certainty: vaguePattern.certainty,
      patternId: vaguePattern.id
    });
  }

  // Check for prompt bloat
  const bloatPattern = agentPatterns.prompt_bloat;
  const bloatResult = bloatPattern.check(content);
  if (bloatResult && options.verbose) {
    results.antiPatternIssues.push({
      ...bloatResult,
      file: agentPath,
      certainty: bloatPattern.certainty,
      patternId: bloatPattern.id
    });
  }

  // Cross-platform compatibility checks
  const crossPlatformPatterns = [
    'hardcoded_claude_dir',
    'claude_md_reference',
    'no_xml_for_data'
  ];

  for (const patternName of crossPlatformPatterns) {
    const pattern = agentPatterns[patternName];
    if (!pattern) continue;

    const result = pattern.check(content);
    if (result && (options.verbose || pattern.certainty !== 'LOW')) {
      results.crossPlatformIssues.push({
        ...result,
        file: agentPath,
        certainty: pattern.certainty,
        patternId: pattern.id
      });
    }
  }

  return results;
}

/**
 * Analyze all agents in a directory
 * @param {string} agentsDir - Path to agents directory
 * @param {Object} options - Analysis options
 * @returns {Array} Array of analysis results
 */
function analyzeAllAgents(agentsDir, options = {}) {
  const results = [];

  if (!fs.existsSync(agentsDir)) {
    return results;
  }

  const agentFiles = fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md') && f !== 'README.md');

  for (const agentFile of agentFiles) {
    const agentPath = path.join(agentsDir, agentFile);
    const result = analyzeAgent(agentPath, options);
    results.push(result);
  }

  return results;
}

/**
 * Main analyze function
 * @param {Object} options - Analysis options
 * @param {string} options.agent - Specific agent name (optional)
 * @param {string} options.agentsDir - Path to agents directory
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @returns {Object|Array} Analysis results
 */
function analyze(options = {}) {
  const {
    agent,
    agentsDir = 'plugins/enhance/agents',
    verbose = false
  } = options;

  if (agent) {
    // Analyze single agent
    const agentPath = agent.endsWith('.md')
      ? path.join(agentsDir, agent)
      : path.join(agentsDir, `${agent}.md`);
    return analyzeAgent(agentPath, { verbose });
  } else {
    // Analyze all agents
    return analyzeAllAgents(agentsDir, { verbose });
  }
}

/**
 * Apply fixes to analysis results
 * @param {Object|Array} results - Analysis results
 * @param {Object} options - Fix options
 * @returns {Object} Fix results
 */
function applyFixes(results, options = {}) {
  const fixer = require('./fixer');

  // Collect all issues
  let allIssues = [];

  if (Array.isArray(results)) {
    for (const r of results) {
      allIssues.push(...(r.structureIssues || []));
      allIssues.push(...(r.toolIssues || []));
      allIssues.push(...(r.xmlIssues || []));
      allIssues.push(...(r.cotIssues || []));
      allIssues.push(...(r.exampleIssues || []));
      allIssues.push(...(r.antiPatternIssues || []));
      allIssues.push(...(r.crossPlatformIssues || []));
    }
  } else {
    allIssues.push(...(results.structureIssues || []));
    allIssues.push(...(results.toolIssues || []));
    allIssues.push(...(results.xmlIssues || []));
    allIssues.push(...(results.cotIssues || []));
    allIssues.push(...(results.exampleIssues || []));
    allIssues.push(...(results.antiPatternIssues || []));
    allIssues.push(...(results.crossPlatformIssues || []));
  }

  return fixer.applyFixes(allIssues, options);
}

/**
 * Generate report from analysis results
 * @param {Object|Array} results - Analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateReport(results, options = {}) {
  const reporter = require('./reporter');

  if (Array.isArray(results)) {
    return reporter.generateAgentSummaryReport(results, options);
  } else {
    return reporter.generateAgentReport(results, options);
  }
}

module.exports = {
  parseMarkdownFrontmatter,
  analyzeAgent,
  analyzeAllAgents,
  analyze,
  applyFixes,
  generateReport
};
