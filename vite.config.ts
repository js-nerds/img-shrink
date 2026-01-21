/// <reference types='vitest' />
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  plugins: [],
  build: {
    outDir: "./dist",
    emptyOutDir: true,
    reportCompressedSize: true,
    target: "ES2021",
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: "index.ts",
      name: "img-shrink",
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
      formats: ["es", "cjs"],
    },
    rollupOptions: {},
  },
});
