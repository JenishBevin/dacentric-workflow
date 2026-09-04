/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  moduleNameMapper: {
    "^@dacentric/types$": "<rootDir>/../../packages/types/src/index.ts",
  },
  setupFiles: ["dotenv/config"],
  testTimeout: 30000,
};
