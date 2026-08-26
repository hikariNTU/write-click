import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const manifest = JSON.parse(readFileSync(new URL("./src/manifest.json", import.meta.url), "utf-8"));

export default defineConfig(({ command }) => ({
  root: "src",
  plugins: [tailwindcss(), crx({ manifest })],
  build: {
    // Absolute, and it has to be.
    //
    // The dev server writes an unpacked extension too, and it resolves this
    // path two different ways. Its per-script writes join it onto Vite's root,
    // `src/`, so `../dist-dev` lands in the project. Its rollup pass hands the
    // same relative string to rollup's `dir`, which resolves against the
    // working directory — the project root — so `../dist-dev` lands one level
    // *above* the repo. The manifest, the locale catalogues and the icons are
    // written by that pass, so they silently ended up outside the project and
    // Chrome refused the directory with "Manifest file is missing or
    // unreadable". An absolute path is the same path either way.
    //
    // Dev also gets its own directory, and never empties it: emptying the
    // folder Chrome has loaded makes the extension vanish mid-session.
    outDir: fileURLToPath(new URL(command === "serve" ? "./dist-dev" : "./dist", import.meta.url)),
    emptyOutDir: command !== "serve",
  },
}));
