import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generati, non scritti da noi: il worker di maplibre copiato in public/
    // (minificato: oltre mille avvisi) e i dati prodotti dall'ETL
    "public/maplibre/**",
    "public/dati/**",
  ]),
]);

export default eslintConfig;
