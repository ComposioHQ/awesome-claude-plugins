/**
 * Code-path discovery helpers for /perf.
 *
 * @module lib/perf/code-paths
 */

const DEFAULT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those',
  'into', 'over', 'under', 'than', 'then', 'when', 'where', 'what', 'which',
  'your', 'you', 'our', 'their', 'there', 'have', 'has', 'had', 'will',
  'would', 'should', 'could', 'about', 'across', 'after', 'before', 'while',
  'perf', 'performance', 'investigation', 'baseline', 'benchmark', 'scenario'
]);

function normalizeKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter(token => token.length > 2)
    .filter(token => !DEFAULT_STOPWORDS.has(token));

  return Array.from(new Set(tokens));
}

function scoreEntry(entry, keywords) {
  let score = 0;
  if (!entry || keywords.length === 0) return score;

  const haystack = [
    entry.file || '',
    ...(entry.symbols || [])
  ].join(' ').toLowerCase();

  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }

  return score;
}

function extractSymbols(fileData) {
  if (!fileData || !fileData.symbols) return [];
  const symbols = [];
  for (const group of Object.values(fileData.symbols)) {
    if (!Array.isArray(group)) continue;
    for (const symbol of group) {
      if (symbol && symbol.name) symbols.push(symbol.name);
    }
  }
  return symbols;
}

function collectCodePaths(repoMap, scenario, limit = 12) {
  if (!repoMap || !repoMap.files) {
    return { keywords: normalizeKeywords(scenario), paths: [] };
  }

  const keywords = normalizeKeywords(scenario);
  const candidates = [];

  for (const [file, data] of Object.entries(repoMap.files)) {
    const symbols = extractSymbols(data);
    const entry = { file, symbols };
    const score = scoreEntry(entry, keywords);
    if (score <= 0) continue;
    candidates.push({ ...entry, score });
  }

  candidates.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  return {
    keywords,
    paths: candidates.slice(0, limit).map(item => ({
      file: item.file,
      score: item.score,
      symbols: item.symbols.slice(0, 8)
    }))
  };
}

module.exports = {
  normalizeKeywords,
  collectCodePaths
};
