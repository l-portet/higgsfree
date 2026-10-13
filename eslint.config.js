// @ts-check
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", "out/**", "dist/**", "node_modules/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "*.{ts,mjs,js}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["src/client/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
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
    files: ["src/client/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Generated media are blob: object urls from IndexedDB: next/image buys nothing here.
      "@next/next/no-img-element": "off",
    },
  },
);
