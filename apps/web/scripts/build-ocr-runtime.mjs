import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const runtimeEntry = resolve(webRoot, ".tmp/ocr-runtime-entry.mjs");
const outDir = resolve(webRoot, "dist-ocr-runtime");

mkdirSync(dirname(runtimeEntry), { recursive: true });
writeFileSync(runtimeEntry, 'export { PaddleOCR } from "@paddleocr/paddleocr-js";\n');

await build({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    minify: "esbuild",
    outDir,
    rollupOptions: {
      input: runtimeEntry,
      preserveEntrySignatures: "strict",
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "[name]-[hash].js",
        entryFileNames: "index.mjs",
      },
    },
    sourcemap: false,
  },
  configFile: false,
  root: webRoot,
});
