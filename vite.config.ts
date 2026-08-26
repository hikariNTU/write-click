import { readFileSync } from "node:fs";
import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const manifest = JSON.parse(readFileSync(new URL("./src/manifest.json", import.meta.url), "utf-8"));

export default defineConfig({
  root: "src",
  plugins: [tailwindcss(), crx({ manifest })],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
