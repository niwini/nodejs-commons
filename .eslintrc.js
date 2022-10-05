const path = require("path");

const tsConfig = path.resolve(__dirname, "tsconfig.json");

module.exports = {
  env: {
    browser: true,
    node: true,
  },
  extends: [
    "@niwini/eslint-config-typescript",
  ],
  parserOptions: {
    project: tsConfig,
  },
  rules: {
    "@typescript-eslint/no-shadow": [
      "error",
      {
        builtinGlobals: false,
      },
    ],
  },
  settings: {
    "import/resolver": {
      typescript: {
        project: tsConfig,
      },
    },
  },
};
