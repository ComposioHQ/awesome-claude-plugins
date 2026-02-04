/**
 * Argument parsing helper for /perf.
 *
 * @module lib/perf/argument-parser
 */

const GREEDY_FLAGS = new Set(['--quote', '--change', '--scenario', '--command', '--rationale']);

function parseArgv(tokens) {
  const args = [];
  if (!Array.isArray(tokens)) return args;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.startsWith('--')) {
      args.push(token);
      if (i + 1 >= tokens.length) {
        continue;
      }
      if (GREEDY_FLAGS.has(token)) {
        const valueTokens = [];
        while (i + 1 < tokens.length && !String(tokens[i + 1]).startsWith('--')) {
          valueTokens.push(tokens[++i]);
        }
        if (valueTokens.length > 0) {
          args.push(valueTokens.join(' '));
        }
        continue;
      }
      if (!String(tokens[i + 1]).startsWith('--')) {
        args.push(tokens[++i]);
      }
      continue;
    }

    args.push(token);
  }

  return args;
}

function parseArguments(raw) {
  if (Array.isArray(raw)) {
    return parseArgv(raw);
  }
  if (!raw || typeof raw !== 'string') return [];

  const args = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      if (quote) {
        escaped = true;
        continue;
      }
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

module.exports = {
  parseArguments
};
