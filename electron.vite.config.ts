import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  main: {
    build: {
      outDir: "dist-electron",
      emptyOutDir: true,
      lib: {
        entry: path.join(__dirname, "electron/main.ts"),
      },
      rollupOptions: {
        external: ["better-sqlite3"], // ✅ CLAVE
      },
    },
  },

  preload: {
    build: {
      outDir: "dist-electron",
      emptyOutDir: false,
      rollupOptions: {
        input: path.join(__dirname, "electron/preload.ts"),
        output: {
          format: "cjs",
          entryFileNames: "preload.cjs",
        },
      },
    },
  },

  renderer: {
    plugins: [react()],
    root: __dirname,
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: path.join(__dirname, "index.html"),
      },
    },
  },
});
