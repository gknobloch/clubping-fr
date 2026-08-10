// Unit-test harness for the mobile app (#148).
//
// Deliberately separate from the web app's Vitest setup: mobile/ has its own
// package.json, its own node_modules and its own tsconfig, and the code under
// test needs the React Native runtime that jest-expo provides. Running it from
// the repo root would pull the web config in; `working-directory: mobile` in CI
// keeps the two apart.
module.exports = {
  preset: 'jest-expo',
  rootDir: __dirname,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Only files under mobile/ — `@shared/*` reaches into ../src for types, and
  // without this Jest would also pick up the web app's own test files.
  roots: ['<rootDir>'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  // The `@/` and `@shared/*` aliases are rewritten by babel-plugin-module-resolver
  // (see babel.config.js), which jest-expo runs through babel-jest — no
  // moduleNameMapper needed here, and no second place to keep in sync.
}
