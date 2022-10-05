/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
const config = {
  collectCoverage: true,
  collectCoverageFrom: [
    "packages/**/*.ts",
    "!**/*.d.ts",
    "!**/*.test.ts",
  ],
  coverageDirectory: "coverage",
  forceExit: true,
  moduleDirectories: [
    "<rootDir>",
    "<rootDir>/packages",
    "node_modules",
  ],
  moduleFileExtensions: [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "node",
  ],
  moduleNameMapper: {
    "^@niwini/(.*)/lib/(.*)": "<rootDir>/packages/$1/lib/$2",
    "^@niwini/([^/]*)$": "<rootDir>/packages/$1",
  },
  setupFilesAfterEnv: [
    "./jest.setup.ts",
  ],
  testEnvironment: "node",
  testRegex: "(?<!\\.integ)\\.(test|spec)\\.tsx?$",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  transformIgnorePatterns: ["node_modules"],
};

// Setup config for local integration test.
if ((process.env.NODE_ENV || "").startsWith("test-integ")) {
  config.collectCoverage = false;
  config.testRegex = "\\.integ\\.(test|spec)\\.tsx?$";
}

module.exports = config;
