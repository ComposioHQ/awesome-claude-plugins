/**
 * Schema validation helpers for /perf.
 *
 * @module lib/perf/schemas
 */

const REQUIRED_INVESTIGATION_FIELDS = ['schemaVersion', 'id', 'status', 'phase', 'scenario'];
const REQUIRED_BASELINE_FIELDS = ['version', 'recordedAt', 'metrics', 'command'];

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function validateInvestigationState(state) {
  const errors = [];

  if (!isObject(state)) {
    return { ok: false, errors: ['state must be an object'] };
  }

  for (const field of REQUIRED_INVESTIGATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(state, field)) {
      errors.push(`missing ${field}`);
    }
  }

  if (typeof state.id !== 'string' || state.id.trim().length === 0) {
    errors.push('id must be a non-empty string');
  }

  if (typeof state.phase !== 'string' || state.phase.trim().length === 0) {
    errors.push('phase must be a non-empty string');
  }

  if (!isObject(state.scenario)) {
    errors.push('scenario must be an object');
  } else {
    if (typeof state.scenario.description !== 'string') {
      errors.push('scenario.description must be a string');
    }
    if (!Array.isArray(state.scenario.metrics)) {
      errors.push('scenario.metrics must be an array');
    }
    if (typeof state.scenario.successCriteria !== 'string') {
      errors.push('scenario.successCriteria must be a string');
    }
    if (state.scenario.scenarios != null) {
      if (!Array.isArray(state.scenario.scenarios)) {
        errors.push('scenario.scenarios must be an array when provided');
      } else {
        state.scenario.scenarios.forEach((scenario, index) => {
          if (!isObject(scenario)) {
            errors.push(`scenario.scenarios[${index}] must be an object`);
            return;
          }
          if (typeof scenario.name !== 'string' || scenario.name.trim().length === 0) {
            errors.push(`scenario.scenarios[${index}].name must be a non-empty string`);
          }
          if (scenario.params != null && !isObject(scenario.params)) {
            errors.push(`scenario.scenarios[${index}].params must be an object when provided`);
          }
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateBaseline(baseline) {
  const errors = [];

  if (!isObject(baseline)) {
    return { ok: false, errors: ['baseline must be an object'] };
  }

  for (const field of REQUIRED_BASELINE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(baseline, field)) {
      errors.push(`missing ${field}`);
    }
  }

  if (typeof baseline.version !== 'string' || baseline.version.trim().length === 0) {
    errors.push('version must be a non-empty string');
  }

  if (typeof baseline.recordedAt !== 'string' || baseline.recordedAt.trim().length === 0) {
    errors.push('recordedAt must be an ISO8601 string');
  }

  if (typeof baseline.command !== 'string' || baseline.command.trim().length === 0) {
    errors.push('command must be a non-empty string');
  }

  if (!isObject(baseline.metrics)) {
    errors.push('metrics must be an object');
  } else {
    if (baseline.metrics.scenarios != null) {
      if (!isObject(baseline.metrics.scenarios)) {
        errors.push('metrics.scenarios must be an object when provided');
      } else {
        for (const [scenarioName, scenarioMetrics] of Object.entries(baseline.metrics.scenarios)) {
          if (!isObject(scenarioMetrics)) {
            errors.push(`metrics.scenarios.${scenarioName} must be an object`);
            continue;
          }
          for (const [key, value] of Object.entries(scenarioMetrics)) {
            if (typeof value !== 'number' || Number.isNaN(value)) {
              errors.push(`metric ${scenarioName}.${key} must be a number`);
            }
          }
        }
      }
    } else {
      for (const [key, value] of Object.entries(baseline.metrics)) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(`metric ${key} must be a number`);
        }
      }
    }
  }

  if (baseline.env && !isObject(baseline.env)) {
    errors.push('env must be an object when provided');
  }

  return { ok: errors.length === 0, errors };
}

function assertValid(result, message) {
  if (!result.ok) {
    throw new Error(`${message}: ${result.errors.join(', ')}`);
  }
}

module.exports = {
  validateInvestigationState,
  validateBaseline,
  assertValid
};
