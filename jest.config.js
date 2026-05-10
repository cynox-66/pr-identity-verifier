/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/webhook/handler.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  verbose: true,

  // Transform ESM-only packages (@noble/ed25519) for Jest's CJS environment.
  // @noble/ed25519 v2 ships as ESM only — Jest needs ts-jest to transform it.
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/ed25519)/)',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    // Transform @noble/ed25519's ESM JS to CJS for Jest
    'node_modules/@noble/ed25519/.+\\.js$': 'ts-jest',
  },
};
