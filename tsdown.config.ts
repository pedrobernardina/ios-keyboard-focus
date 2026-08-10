import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/react.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  treeshake: true,
});
