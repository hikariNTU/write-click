/*
 * The listing images, composed from the raw captures, once per locale.
 *
 * `npm run shots` produces screenshots; a screenshot is not a listing image.
 * Each file in `shots/slides/` is one image — a headline, a line of copy, and
 * one or two captures on the extension's own background. The slides carry no
 * words of their own: the copy lives in `copy.json`, keyed slide → locale, and
 * is put in at render time.
 *
 * Split from capture on purpose, and this is the whole reason the split exists:
 * the copy is the part that gets rewritten fifteen times, and rewriting it must
 * not mean re-capturing the set.
 *
 * What is *not* redrawn is anything inside a frame. Every pixel of every
 * capture is something the extension put on screen, in a build made minutes
 * earlier by the harness that captured it.
 *
 * Run with `npm run shots:slides`. Output lands in `shots/submit/<locale>/`,
 * which is emptied first: a slide that was renamed or dropped would otherwise
 * linger as a PNG that still looks uploadable.
 */

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { extname, resolve } from "node:path";

import { chromium } from "playwright";

import type { Locale } from "../src/shared/i18n.ts";

const root = resolve(import.meta.dirname, "..");
const shots = resolve(root, "shots");
const slides = resolve(shots, "slides");
const out = resolve(shots, "out");
const submit = resolve(shots, "submit");

const PORT = 8972;
const WIDTH = 1280;
const HEIGHT = 800;

/**
 * One listing per language the extension ships, because the dashboard takes its
 * own set of images per listing language and derives that list from `_locales`.
 *
 * The font stack differs by locale: the same slide set in one face for both
 * would render the Chinese copy in whatever fallback the machine happens to
 * have, which is the one thing on the slide nobody would check.
 */
const LOCALES: Record<Locale, string> = {
  en: '-apple-system, "Helvetica Neue", Arial, sans-serif',
  zh_TW: '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif',
};

/** The `lang` attribute for a locale, which is spelled with a hyphen. */
const TAG: Record<Locale, string> = { en: "en", zh_TW: "zh-TW" };

interface Copy {
  h1: string;
  p: string;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/** Rooted at `shots/`, so a slide can reach `../out/` for its captures. */
function serve(): Promise<Server> {
  const server = createServer((request, response) => {
    const name = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "").replace(/^\/+/, "");
    const path = resolve(shots, name);
    if (!path.startsWith(shots) || !existsSync(path)) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(response);
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

if (!existsSync(out) || readdirSync(out).length === 0) {
  console.error("shots/out is empty — run `npm run shots` first.");
  process.exit(1);
}

const copy = JSON.parse(readFileSync(resolve(slides, "copy.json"), "utf8")) as Record<
  string,
  Record<string, Copy>
>;
const pages = readdirSync(slides)
  .filter((name) => name.endsWith(".html"))
  .toSorted();

const locales = Object.keys(LOCALES) as Locale[];
const unwritten = pages
  .map((name) => name.replace(/\.html$/, ""))
  .filter((slide) => locales.some((locale) => !copy[slide]?.[locale]));
if (unwritten.length > 0) {
  console.error(`copy.json has no entry for: ${unwritten.join(", ")}`);
  process.exit(1);
}

rmSync(submit, { recursive: true, force: true });

const server = await serve();
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  // 2× for crisp text, downscaled by Chrome rather than by us: the listing takes
  // 1280×800, and Chrome's downscale of a 2× render is sharper than a 1× render
  // of the same page.
  deviceScaleFactor: 2,
});

/** A slide pointing at a capture that is not there renders a gap, silently. */
const absent: string[] = [];
page.on("requestfailed", (request) => absent.push(request.url()));

for (const locale of locales) {
  const folder = resolve(submit, locale);
  mkdirSync(folder, { recursive: true });
  console.log(`${locale}:`);

  for (const name of pages) {
    const slide = name.replace(/\.html$/, "");
    const text = copy[slide]?.[locale];
    if (!text) continue;
    await page.goto(`http://localhost:${PORT}/slides/${name}`, { waitUntil: "networkidle" });

    await page.evaluate(
      async ({ tag, font, words, listing }) => {
        document.documentElement.lang = tag;
        document.body.style.fontFamily = font;
        // The capture is chosen here rather than written into the slide: the
        // interface inside the frame is in the listing's own language, and a
        // slide that hard-coded one folder would ship English screenshots to
        // every listing.
        const frames = [...document.querySelectorAll("img[data-shot]")];
        await Promise.all(
          frames.map((frame) => {
            if (!(frame instanceof HTMLImageElement)) return Promise.resolve();
            frame.src = `../out/${listing}/${frame.dataset.shot}.png`;
            return frame.decode();
          }),
        );
        const heading = document.querySelector("h1");
        const line = document.querySelector("p");
        if (!heading || !line) throw new Error("the slide has no heading or no line of copy");
        // `*this*` takes the accent gradient — a marker rather than markup, so
        // the copy file stays something a person can edit without knowing HTML.
        heading.innerHTML = words.h1
          .replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char)
          .replace(/\*([^*]+)\*/g, "<em>$1</em>");
        line.textContent = words.p;
      },
      { tag: TAG[locale], font: LOCALES[locale], words: text, listing: locale },
    );

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(folder, `${slide}.png`), scale: "css" });
    console.log(`  ${slide}.png`);
  }
}

await browser.close();
server.close();

if (absent.length > 0) {
  console.error("\nA slide asked for something that is not in shots/out:");
  for (const url of new Set(absent)) console.error(`  ${url}`);
  process.exit(1);
}

console.log(
  `\n${pages.length} images × ${locales.length} listings in shots/submit —` +
    " the store takes five per listing.",
);
