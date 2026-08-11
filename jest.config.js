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
  // Order independence is a property of the suite, not of one CI invocation:
  // set here, a local `npm test` catches the leak that CI would.
  randomize: true,
  restoreMocks: true,
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.(ts|tsx)',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/tests/**',
  ],
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  coverageDirectory: 'coverage',
  // Floors just under current (94.7 / 89.7 / 100 / 97.4).
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 85,
      functions: 95,
      lines: 95,
    },
  },
};
