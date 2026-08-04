module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Keeps an untracked local dev/ out of the testMatch globs below.
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/**/__tests__/**/*.(ts|tsx|js)',
    '<rootDir>/**/?(*.)(spec|test).(ts|tsx|js)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(ts|tsx)',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/tests/**',
  ],
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  coverageDirectory: 'coverage',
  // Floors set just under the current numbers (94.7 stmts / 89.7 branch /
  // 100 funcs / 97.4 lines) so coverage cannot silently regress, with enough
  // headroom that a small honest change does not fail the build.
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 85,
      functions: 95,
      lines: 95,
    },
  },
};
