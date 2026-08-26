import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Vendors the glyphs we use out of @material-symbols/svg-700 and into src/.
 *
 * They cannot be imported straight from node_modules: Vite's root is src/, so
 * a `?raw` import from outside it is served over a /@fs/ URL, which the dev
 * server then resolves against the root and turns into src/@fs/... — an ENOENT
 * on every content-script load. Copying them under the root sidesteps it, and
 * keeps the build reproducible without the dependency present.
 *
 * Run by prebuild and predev. The copies are committed.
 *
 * The target is src/icons/material/, NOT src/icons/, because this script wipes
 * its target directory before copying. Hand-authored artwork lives one level up
 * in src/icons/ and must never share a directory with generated files.
 */
const ICONS = [
  "arrow_back",
  "arrow_forward",
  "block",
  "cached",
  "check_circle",
  "close",
  "delete",
  "draw",
  "help",
  "keyboard_double_arrow_down",
  "keyboard_double_arrow_left",
  "keyboard_double_arrow_right",
  "keyboard_double_arrow_up",
  "grid_view",
  "language",
  "minimize",
  "mouse",
  "open_in_new",
  "palette",
  "public",
  "refresh",
  "restart_alt",
  "restore_from_trash",
  "settings",
  "swipe",
  "tab_close",
  "tab_close_right",
  "vertical_align_bottom",
  "vertical_align_top",
];

const from = new URL("../node_modules/@material-symbols/svg-700/rounded/", import.meta.url);
const to = new URL("../src/icons/material/", import.meta.url);

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });

for (const name of ICONS) {
  copyFileSync(new URL(`${name}.svg`, from), new URL(`${name}.svg`, to));
}

const written = readdirSync(fileURLToPath(to)).length;
if (written !== ICONS.length) {
  throw new Error(`expected ${ICONS.length} icons, wrote ${written}`);
}
console.log(`synced ${written} icons -> src/icons/material/`);
