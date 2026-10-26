import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Server Actions menerima (prevState, formData); argumen yang tidak
      // dipakai diberi prefix garis bawah sesuai konvensi TypeScript.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Uang tidak boleh dihitung dengan floating point (blueprint §8).
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Gunakan Decimal dari @/lib/money untuk perhitungan uang." },
      ],
    },
  },
];

export default config;
