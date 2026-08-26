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
 *
 * The small sizes come from a separate, simplified drawing. The full mark has a
 * mouse body, a button split and a blurred glow, none of which survive a 16px
 * box — they average out into one muddy blob.
 */
const SOURCES = {
  full: new URL("../src/icons/write-click.svg", import.meta.url),
  small: new URL("../src/icons/write-click-small.svg", import.meta.url),
};

/** Below 48px the detail costs legibility rather than adding to it. */
const SIZES = [
  { size: 16, art: "small" },
  { size: 32, art: "small" },
  { size: 48, art: "full" },
  { size: 128, art: "full" },
];

const out = new URL("../src/images/", import.meta.url);
const svg = {
  full: readFileSync(SOURCES.full),
  small: readFileSync(SOURCES.small),
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const { size, art } of SIZES) {
  const png = new Resvg(svg[art], { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(`icon-${size}.png`, out), png);
}

console.log(`rendered ${SIZES.length} icons -> src/images/`);
