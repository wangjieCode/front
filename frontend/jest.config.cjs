module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
  },
  clearMocks: true,
};
