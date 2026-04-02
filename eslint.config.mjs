import { createRequire } from "module";

const require = createRequire(import.meta.url);
const coreWebVitals = require("eslint-config-next/core-web-vitals");
const typescript = require("eslint-config-next/typescript");

const config = [
  { ignores: [".next/**", "out/**", "build/**", "node_modules/**", "src/generated/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Next 16 removed `next lint`; these rules are overly strict for URL/localStorage sync patterns here.
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-page-custom-font": "off",
      "@next/next/no-img-element": "off",
      "import/no-anonymous-default-export": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
