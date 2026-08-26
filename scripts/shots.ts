/*
 * Store and README screenshots, captured rather than taken.
 *
 * Headless, repeatable, no judgement and no fixture to seed by hand. Every
 * piece of state this extension has is a `chrome.storage` key, so the harness
 * writes the settings a shot needs through the service worker and reloads —
 * there is nothing here that needs a person to click a permission prompt.
 *
 * Run with `npm run shots`. Output lands in `shots/out/<locale>/`, which is
 * emptied first: a PNG left behind from two runs ago is indistinguishable
 * from a fresh one, and just as uploadable.
 *
 * A capture is not a listing image. These are bare screenshots; composing them
 * with a headline on a background is a separate step, deliberately, because
 * the copy is the part that gets rewritten fifteen times and rewriting it
 * should not mean re-capturing the set.
 */

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { extname, resolve } from "node:path";

import sharp from "sharp";
import { chromium } from "playwright";
import type { BrowserContext, Page, Worker } from "playwright";

import type { Locale } from "../src/shared/i18n.ts";
import type { LocalSettings, SyncSettings } from "../src/shared/settings.ts";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const fixtures = resolve(root, "shots/fixtures");
const out = resolve(root, "shots/out");

/** The listing wants 1280×800. Shot at 2× and downscaled, for crisp text. */
const WIDTH = 1280;
const HEIGHT = 800;
const SCALE = 2;

const PORT = 8971;
const page = (title: string): string =>
  `http://localhost:${PORT}/page.html?title=${encodeURIComponent(title)}`;

/**
 * The tab strip the shot is taken in, split around the tab the shot is taken
 * on. Long enough that the grid fills a row and the close-to-the-right count is
 * a number worth reading, and ordinary enough to pass for a real morning's
 * browsing.
 */
const BEFORE = ["Inbox", "Pull requests · write-click"] as const;
const SHOT = "MDN — PointerEvent";
const AFTER = [
  "Chrome extensions — chrome.tabs",
  "Tailwind CSS — Theme",
  "Hacker News",
  "Notes",
] as const;

/** Everything except `enabled`, which each shot sets for itself. */
const GRID = {
  holdMs: 180,
  size: "normal",
  cheatsheet: true,
  pickOnRelease: true,
} as const;

/** One folder per locale the extension ships, since the listing takes a set per language. */
const LOCALES: readonly Locale[] = ["en", "zh_TW"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
};

/** Served rather than opened as `file://`, which needs its own per-extension grant. */
function serve(): Promise<Server> {
  const server = createServer((request, response) => {
    const name = (request.url ?? "/").split("?")[0]?.replace(/^\/+/, "") || "page.html";
    const path = resolve(fixtures, name);
    if (!path.startsWith(fixtures) || !existsSync(path)) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(response);
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

async function launch(dir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(dir, {
    // The `chromium` channel is the one that runs MV3 extensions headless.
    channel: "chromium",
    headless: true,
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
}

async function worker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

/**
 * Waits for the install-time migration to land before anything is seeded.
 *
 * `migrate()` reads storage and then writes the merged result back, and a fresh
 * profile means it is running at exactly the moment the harness connects. A
 * seed written between those two moments is read as absent and overwritten by
 * the defaults — which showed up as a gesture that never fired, because the
 * platform default pairs the right button with Alt and the seed had cleared it.
 *
 * Polled on `version`, whatever it is, rather than the number of the day: this
 * waits for the migration to have run, not for a particular schema.
 */
async function migrated(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const { version } = await chrome.storage.local.get("version");
      if (version !== undefined) return;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    throw new Error("the install-time migration never wrote its settings");
  });
}

/**
 * Writes settings the way the options page does — top-level keys in their own
 * area — and waits for the content script to pick them up.
 *
 * `storage.onChanged` re-reads settings on every open tab without a reload, but
 * the grid is built once when the view is created, so anything that turns it on
 * or off only takes effect on the next load. Callers reload after this.
 */
async function settings(
  sw: Worker,
  patch: { sync?: Partial<SyncSettings>; local?: Partial<LocalSettings> },
): Promise<void> {
  await sw.evaluate(async (write) => {
    if (write.sync) await chrome.storage.sync.set(write.sync);
    if (write.local) await chrome.storage.local.set(write.local);
  }, patch);
}

function file(locale: Locale, name: string): string {
  const dir = resolve(out, locale);
  mkdirSync(dir, { recursive: true });
  return resolve(dir, `${name}.png`);
}

/** A full window, downscaled from 2× to the size the dashboard asks for. */
async function shoot(target: Page, locale: Locale, name: string): Promise<void> {
  const raw = await target.screenshot();
  await sharp(raw).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toFile(file(locale, name));
  console.log(`  ${locale}/${name}.png`);
}

/**
 * One region, at its own shape and its own 2× pixels.
 *
 * Not fitted to 1280×800: these are for the README, where they sit at whatever
 * width the column is, and padding them onto a listing-shaped canvas would
 * hand the page an image that is mostly background.
 */
async function shootRegion(
  target: Page,
  locale: Locale,
  name: string,
  selector: string,
  pad = 16,
): Promise<void> {
  const section = target.locator(selector);
  // Scrolled to first, and measured after: a `clip` is in viewport coordinates,
  // so a section below the fold measures at a `y` past the bottom of the window
  // and clips to nothing.
  await section.scrollIntoViewIfNeeded();
  await target.waitForTimeout(400);
  const box = await section.boundingBox();
  if (!box) throw new Error(`${selector} not found`);

  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  await target.screenshot({
    path: file(locale, name),
    clip: {
      x,
      y,
      width: Math.min(WIDTH - x, box.width + pad * 2),
      height: Math.min(HEIGHT - y, box.height + pad * 2),
    },
  });
  console.log(`  ${locale}/${name}.png`);
}

/**
 * Draws a stroke and leaves the trigger held, so the caller shoots what is on
 * screen mid-gesture rather than after it has been cleared.
 *
 * Moved in small steps rather than jumped: the recognizer quantizes a path, and
 * a single move from one corner to another is one sample, not a stroke.
 */
async function draw(
  target: Page,
  from: { x: number; y: number },
  legs: readonly { x: number; y: number }[],
): Promise<void> {
  await target.mouse.move(from.x, from.y);
  await target.mouse.down({ button: "right" });
  let at = from;
  for (const leg of legs) {
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      await target.mouse.move(at.x + (leg.x * i) / steps, at.y + (leg.y * i) / steps);
    }
    at = { x: at.x + leg.x, y: at.y + leg.y };
  }
}

/**
 * Ends the gesture without running it.
 *
 * Escape cancels the stroke before the button comes up, and it has to: shot 1
 * draws "close the tabs to the right", so a plain release closes four of the
 * harness's own tabs and the grid shot photographs the three survivors.
 */
async function release(target: Page): Promise<void> {
  await target.keyboard.press("Escape");
  await target.mouse.up({ button: "right" });
  await target.waitForTimeout(200);
}

/** The strip, still whole. A shot that ran its own gesture is a shot of the wrong tab list. */
async function intact(sw: Worker): Promise<void> {
  const open = await sw.evaluate(() => chrome.tabs.query({ currentWindow: true }));
  const want = BEFORE.length + 1 + AFTER.length;
  if (open.length !== want) {
    throw new Error(`the strip is ${open.length} tabs, not ${want} — a gesture ran`);
  }
}

/**
 * Opens the tab strip the grid draws, and hands back the tab the shot is taken
 * on — the one Playwright drives.
 *
 * Built through the extension's own `chrome.tabs`, not `context.newPage()`:
 * the grid lists one window's tabs, and Playwright makes no promise about
 * which window a new page lands in. Created from the worker, every tab belongs
 * to the window the shot is taken in, at a known index, so the strip either
 * comes out exactly as written or the run stops.
 */
async function strip(context: BrowserContext, sw: Worker): Promise<Page> {
  const shot = context.pages()[0] ?? (await context.newPage());
  await shot.goto(page(SHOT));
  await shot.bringToFront();

  const opened = await sw.evaluate(
    async ({ title, before, after }) => {
      // Found by title rather than by URL: `tabs.query` matches URLs as match
      // patterns, which do not see a query string, and the query string is the
      // only thing telling these pages apart.
      const all = await chrome.tabs.query({});
      const self = all.find((tab) => tab.title === title);
      if (self?.id === undefined) throw new Error("the shot tab is not open");

      // Pinned to the shot tab's own window. Left to `currentWindow`, the tabs
      // land in whichever window Chrome considers focused, and the grid lists
      // `tabs.query({ windowId })` for the window the gesture is drawn in —
      // which is how a seven-tab strip came out as a three-tile grid.
      const { windowId } = self;
      await chrome.tabs.move(self.id, { windowId, index: before.length });
      // Sequential: each `create` is placed by index, and an index only means
      // anything once the tabs before it exist.
      for (const [at, url] of before.entries()) {
        await chrome.tabs.create({ url, windowId, index: at, active: false });
      }
      for (const [at, url] of after.entries()) {
        await chrome.tabs.create({ url, windowId, index: before.length + 1 + at, active: false });
      }
      await chrome.tabs.update(self.id, { active: true });
      return (await chrome.tabs.query({ windowId })).length;
    },
    { title: SHOT, before: BEFORE.map(page), after: AFTER.map(page) },
  );

  const want = BEFORE.length + 1 + AFTER.length;
  if (opened !== want) throw new Error(`the strip came out ${opened} tabs, not ${want}`);
  return shot;
}

async function capture(
  context: BrowserContext,
  sw: Worker,
  shot: Page,
  locale: Locale,
): Promise<void> {
  const id = sw.url().split("/")[2];
  console.log(`${locale}:`);

  /*
   * A bare right button, whatever the machine running this thinks the default
   * should be. The default is platform-dependent — macOS and Linux pair it with
   * Alt, because the context menu opens there before any drift exists — and a
   * capture that changes shape with the host is not a capture.
   */
  const trigger = { kind: "button", button: 2 } as const;

  // 1. Mid-gesture: the stroke, and the readout naming what it matched. The
  //    grid is off for this one, so the middle of the window is the subject.
  await settings(sw, {
    sync: { language: locale, grid: { ...GRID, enabled: false } },
    local: { trigger, uiScale: 1 },
  });

  await shot.bringToFront();
  await shot.reload();
  await shot.waitForTimeout(400);

  // URD — close the tabs to the right. It is the command whose readout says
  // something a static list cannot: how many tabs it would actually close.
  // Drawn in the lower half: the readout is centred, and a stroke through it
  // hides the half of itself that says what shape was drawn.
  await draw(shot, { x: 470, y: 700 }, [
    { x: 0, y: -160 },
    { x: 220, y: 0 },
    { x: 0, y: 160 },
  ]);
  await shot.waitForTimeout(250);
  await shoot(shot, locale, "1-gesture");
  await release(shot);

  // 2. The grid, open, with the gesture list under it. Drawn from near the top
  //    so the pointer reaches a tile without a long stroke across the shot.
  await settings(sw, { sync: { grid: { ...GRID, enabled: true } } });
  await shot.reload();
  await shot.waitForTimeout(400);

  // Up onto a tile, and short: releasing over a tile is how a tab is picked, so
  // the highlight under the pointer is part of what this shot is about.
  await draw(shot, { x: 410, y: 300 }, [{ x: 0, y: -205 }]);
  // Past holdMs, and past the reveal transition that follows it.
  await shot.waitForTimeout(600);
  await shoot(shot, locale, "2-grid");
  await release(shot);

  // 3, 4, 5. The options page. Plain DOM, so these crop by selector.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.waitForTimeout(600);

  await shoot(options, locale, "3-options");
  await shootRegion(options, locale, "4-gestures", "#gestures");
  await shootRegion(options, locale, "5-overlay", "#overlay");
  await options.close();

  await intact(sw);
}

/*
 * Always rebuilt.
 *
 * `npm run dev` writes to `dist-dev/`, so it cannot poison this the way it
 * could if both wrote to one directory — but a stale `dist/` from before the
 * last edit is still a screenshot of the wrong extension.
 */
console.log("building…");
rmSync(dist, { recursive: true, force: true });
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });

rmSync(out, { recursive: true, force: true });

const server = await serve();
const profile = resolve(root, "shots/.run");
rmSync(profile, { recursive: true, force: true });

const context = await launch(profile);
try {
  const sw = await worker(context);
  await migrated(sw);

  const shot = await strip(context, sw);
  for (const locale of LOCALES) await capture(context, sw, shot, locale);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
  server.close();
}

console.log(`\nshots/out — check them before uploading. The harness makes them
repeatable, not good.`);
