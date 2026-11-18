import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "dist/"]
  },
  js.configs.recommended,
  {
    files: ["background/**/*.js", "common/**/*.js", "pages/**/*.js", "content/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions
      }
    }
  },
  {
    files: ["content/**/*.js"],
    languageOptions: {
      sourceType: "script"
    }
  },
  {
    files: ["scripts/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node
    }
  }
];
