/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
module.exports = {
  packageManager: 'npm',
  testRunner: 'jest',
  mutate: [
    'src/**/*.js',
    '!src/gateway-stub/**/*.js'
  ],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  coverageAnalysis: 'perTest',
  thresholds: {
    high: 90,
    low: 80,
    break: 90
  },
  jest: {
    projectType: 'custom',
    config: {
      testEnvironment: 'node',
      testMatch: ['**/*.test.js']
    }
  }
};
