import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The demos normally run against src, so editing the library hot-reloads them.
// DEMO_TARGET=dist points them at the built output instead — the exact artifact
// that gets published, which is otherwise never exercised in a browser.
const fromDist = process.env.DEMO_TARGET === "dist";
const dir = fromDist ? "dist" : "src";
const ext = fromDist ? "js" : "ts";

const entry = (name: string) =>
  resolve(import.meta.dirname, dir, `${name}.${ext}`);

// Served from the root by default, which keeps the URL you type on the phone
// short. The Pages workflow sets DEMO_BASE=/<repo>/, since that is where
// GitHub serves it from.
const base = process.env.DEMO_BASE ?? "/";

// These demos are only meaningful on a real iPhone, which in practice means
// reaching this dev server through an ngrok or cloudflared tunnel. Vite rejects
// hostnames it does not know as protection against DNS rebinding, and there is
// no CLI flag for it — it has to be set here. A throwaway demo server serving
// four static pages has nothing worth rebinding to.
const tunnelFriendly = { allowedHosts: true } as const;

export default defineConfig({
  root: "demo",
  base,
  plugins: [react()],
  server: tunnelFriendly,
  preview: tunnelFriendly,
  resolve: {
    alias: [
      // Longest first: "ios-keyboard-focus" would otherwise swallow the
      // "/react" subpath. The demos import the package by name so they read
      // exactly like the README, while running against the local source.
      { find: "ios-keyboard-focus/react", replacement: entry("react") },
      { find: "ios-keyboard-focus", replacement: entry("index") },
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
