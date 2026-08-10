import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = (file: string) => resolve(import.meta.dirname, "src", file);

// Served from the root by default, which keeps the URL you type on the phone
// short. The Pages workflow sets DEMO_BASE=/<repo>/, since that is where
// GitHub serves it from.
const base = process.env.DEMO_BASE ?? "/";

export default defineConfig({
  root: "demo",
  base,
  plugins: [react()],
  resolve: {
    alias: [
      // Longest first: "ios-keyboard-focus" would otherwise swallow the
      // "/react" subpath. The demos import the package by name so they read
      // exactly like the README, while running against the local source.
      { find: "ios-keyboard-focus/react", replacement: src("react.ts") },
      { find: "ios-keyboard-focus", replacement: src("index.ts") },
    ],
  },
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "demo/index.html"),
        vanilla: resolve(import.meta.dirname, "demo/vanilla/index.html"),
        react: resolve(import.meta.dirname, "demo/react/index.html"),
      },
    },
  },
});
