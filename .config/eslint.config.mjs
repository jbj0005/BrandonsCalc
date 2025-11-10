import tseslint from "typescript-eslint";
export default [
  { ignores: ["dist/**", "coverage/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
];
