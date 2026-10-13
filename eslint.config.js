// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src/client/node_modules/**", "data/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      // React Compiler readiness, not correctness: it flags every effect that syncs derived state
      // (snap options to the selected model, follow Settings › Defaults, consume a store hand-off).
      // Those effects are deliberate and the compiler is not in use; the rest of the recommended set
      // (rules-of-hooks, exhaustive-deps, refs, purity, set-state-in-render, …) stays on.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    ...reactRefresh.configs.vite,
  },
);
