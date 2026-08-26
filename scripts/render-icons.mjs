import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

/**
 * Rasterizes src/icons/write-click.svg into the PNGs the manifest points at.
 *
 * Chrome will not take an SVG for `icons` or `action.default_icon`, so these
 * have to exist as bitmaps. Rendering happens here rather than by hand so the
 * set cannot drift from the source art, and resvg is used rather than a
 * headless browser so the build needs no Chrome.
 *
 * Wipes src/images/ — that directory is generated. The source art lives in
 * src/icons/ and is never touched.
 */
const SIZES = [16, 32, 48, 128];

const source = new URL("../src/icons/write-click.svg", import.meta.url);
const out = new URL("../src/images/", import.meta.url);
const svg = readFileSync(source);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const size of SIZES) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(`icon-${size}.png`, out), png);
}

console.log(`rendered ${SIZES.length} icons -> src/images/`);
