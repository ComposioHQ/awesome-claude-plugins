/**
 * Detection Configurations
 * Centralized config for platform detection logic
 *
 * @module lib/platform/detection-configs
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * CI platform detection configuration
 * Order matters - first match wins
 */
const CI_CONFIGS = [
  { file: '.github/workflows', platform: 'github-actions' },
  { file: '.gitlab-ci.yml', platform: 'gitlab-ci' },
  { file: '.circleci/config.yml', platform: 'circleci' },
  { file: 'Jenkinsfile', platform: 'jenkins' },
  { file: '.travis.yml', platform: 'travis' }
];

/**
 * Deployment platform detection configuration
 * Order matters - first match wins
 */
const DEPLOYMENT_CONFIGS = [
  { file: 'railway.json', platform: 'railway' },
  { file: 'railway.toml', platform: 'railway' },  // Legacy Railway marker
  { file: 'vercel.json', platform: 'vercel' },
  { file: 'netlify.toml', platform: 'netlify' },
  { file: '.netlify', platform: 'netlify' },       // Legacy Netlify marker
  { file: 'fly.toml', platform: 'fly' },
  { file: '.platform.app.yaml', platform: 'platformsh' },
  { file: 'render.yaml', platform: 'render' }
];

/**
 * Project type detection configuration
 * Checks package.json for framework indicators
 */
const PROJECT_TYPE_CONFIGS = {
  dependencies: [
    { name: 'next', type: 'nextjs' },
    { name: 'react', type: 'react' },
    { name: 'vue', type: 'vue' },
    { name: '@angular/core', type: 'angular' },
    { name: 'svelte', type: 'svelte' },
    { name: 'express', type: 'express' },
    { name: '@nestjs/core', type: 'nestjs' },
    { name: 'gatsby', type: 'gatsby' },
    { name: '@remix-run/react', type: 'remix' },
    { name: 'astro', type: 'astro' }
  ]
};

/**
 * Package manager detection configuration
 * Lock files indicate package manager used
 * Order matters - first match wins (prioritize pnpm > yarn > bun > npm for Node.js)
 */
const PACKAGE_MANAGER_CONFIGS = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'package-lock.json', manager: 'npm' },
  { file: 'poetry.lock', manager: 'poetry' },
  { file: 'Pipfile.lock', manager: 'pipenv' },
  { file: 'Cargo.lock', manager: 'cargo' },
  { file: 'go.sum', manager: 'go' }
];

/**
 * Branch strategy patterns
 */
const BRANCH_STRATEGIES = {
  gitflow: ['develop', 'main', 'master'],
  githubflow: ['main'],
  trunkbased: ['main', 'trunk']
};

/**
 * Main branch candidates (in priority order)
 */
const MAIN_BRANCH_CANDIDATES = ['main', 'master', 'trunk', 'develop'];

module.exports = {
  CI_CONFIGS,
  DEPLOYMENT_CONFIGS,
  PROJECT_TYPE_CONFIGS,
  PACKAGE_MANAGER_CONFIGS,
  BRANCH_STRATEGIES,
  MAIN_BRANCH_CANDIDATES
};
