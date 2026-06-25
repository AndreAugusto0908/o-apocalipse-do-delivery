/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
module.exports = {
  packageManager: 'npm',
  testRunner: 'jest',
  mutate: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  reporters: ['clear-text', 'progress', 'html'],
  coverageAnalysis: 'perTest',
  thresholds: {
    high: 90,
    low: 80,
    break: 80
  },
  jest: {
    projectType: 'custom',
    config: {
      testEnvironment: 'node',
      testMatch: ['**/*.test.js']
    }
  }
};
