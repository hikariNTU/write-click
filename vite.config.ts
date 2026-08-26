import { readFileSync } from "node:fs";
import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const manifest = JSON.parse(readFileSync(new URL("./src/manifest.json", import.meta.url), "utf-8"));

export default defineConfig(({ command }) => ({
  root: "src",
  plugins: [tailwindcss(), crx({ manifest })],
  build: {
    // Dev gets its own directory, and never empties it.
    //
    // The dev server writes an unpacked extension too, and it used to write it
    // over `dist`. Starting it emptied the very folder Chrome had loaded, and
    // the extension dropped out mid-session with "Manifest file is missing or
    // unreadable" — the manifest really was gone for that moment. Keeping the
    // two apart means a dev run cannot disturb a loaded build, and load
    // `dist-dev` once to work against the dev server.
    outDir: command === "serve" ? "../dist-dev" : "../dist",
    emptyOutDir: command !== "serve",
  },
}));
