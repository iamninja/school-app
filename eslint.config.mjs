import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      // Generated at runtime by `supabase start`, not source we own.
      "supabase/.temp/**",
      "supabase/.branches/**",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
