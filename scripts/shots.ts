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
import type { Point } from "../src/shared/recognizer.ts";
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

/**
 * The tab strip the shot is taken in, split around the tab the shot is taken on.
 *
 * Long enough that the grid fills a row and the close-to-the-right count is a
 * number worth reading, and ordinary enough to pass for a real morning's
 * browsing.
 *
 * Every one of these is the same fixture file, served from the same server, on
 * a hostname Chrome resolves back to it (see `launch`). The names are all under
 * `example.com` — the domain reserved for exactly this — because the tiles show
 * the host, and seven tiles all reading `localhost:8971` says nothing about
 * what the grid is for. Each site gets its own hue, which colours both the page
 * and the favicon, so the strip does not come out as one page seven times.
 */
interface Site {
  host: string;
  title: string;
  hue: number;
}

const BEFORE: readonly Site[] = [
  { host: "mail.example.com", title: "Inbox — 12 unread", hue: 210 },
  { host: "code.example.com", title: "Pull requests · write-click", hue: 265 },
];
const SHOT: Site = { host: "docs.example.com", title: "Pointer events — Web docs", hue: 22 };
const AFTER: readonly Site[] = [
  { host: "developer.example.com", title: "chrome.tabs — extension reference", hue: 150 },
  { host: "design.example.com", title: "Theme tokens and palette", hue: 320 },
  { host: "news.example.com", title: "Front page", hue: 15 },
  { host: "notes.example.com", title: "Notes — this week", hue: 250 },
];

/**
 * The last two tabs of the strip, grouped and named.
 *
 * The grid draws a group as a heading and a coloured edge on each tile in it,
 * and a strip with no group leaves both invisible — which is a screenshot that
 * says the grid is a flat list of titles. Two tabs is enough for the run to
 * read as a run.
 */
const GROUP = { title: "Reference", color: "blue", size: 2 } as const;

const page = (site: Site): string =>
  `http://${site.host}/page.html?title=${encodeURIComponent(site.title)}&hue=${site.hue}`;

/**
 * The trail, at its shipped defaults. Spelled out because a settings patch is a
 * whole top-level key: writing `{ showLabel }` alone would be typed as a
 * partial trail and read back as one. Keep in step with `defaultSyncSettings`.
 */
const TRAIL = { show: true, color: "#34d399", width: 4 } as const;

/** Everything except `enabled`, which each shot sets for itself. */
const GRID = {
  holdMs: 180,
  size: "normal",
  cheatsheet: true,
  pickOnRelease: true,
  // Off, unlike the shipped default: the capture run drives a browser of its
  // own and a stray second window would put a heading and someone else's tabs
  // in the store screenshot.
  allWindows: false,
} as const;

/**
 * The bottom of the window while the trigger is held: the tail of the stroke,
 * the page under it, and the gesture list docked along the bottom edge.
 *
 * Cut wider than the panel itself on purpose. The list alone is a ribbon about
 * six times as wide as it is tall, and a ribbon on a 1280×800 listing image is
 * a line of text in a field of background — where it is on screen, and what it
 * is next to, is half of what the picture is saying.
 */
const CHEATSHEET_BAND = { x: 96, y: 352, width: 1088, height: 440 } as const;

/** One folder per locale the extension ships, since the listing takes a set per language. */
const LOCALES: readonly Locale[] = ["en", "zh_TW"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};

/**
 * A favicon, drawn rather than stored.
 *
 * The tiles show one, and seven tabs with none is seven copies of the fallback
 * glyph — which is the grid's error state, not its normal one. Generated per
 * hue so the strip reads as seven different sites at a glance, and served over
 * http because `chrome.tabs` hands back a data: URL favicon verbatim and the
 * grid only draws http(s).
 */
function favicon(hue: number, letter: string): string {
  const text = letter.replace(/[<&>]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(${hue} 74% 52%)"/>
    <stop offset="100%" stop-color="hsl(${hue + 140} 68% 48%)"/>
  </linearGradient></defs>
  <rect width="32" height="32" rx="8" fill="url(#g)"/>
  <text x="16" y="22" text-anchor="middle" fill="#fff"
    font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700">${text}</text>
</svg>`;
}

/** Served rather than opened as `file://`, which needs its own per-extension grant. */
function serve(): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture");
    const name = url.pathname.replace(/^\/+/, "") || "page.html";

    if (name === "icon.svg") {
      const hue = Number(url.searchParams.get("hue") ?? 210);
      response.writeHead(200, { "content-type": MIME[".svg"] as string });
      response.end(
        favicon(Number.isFinite(hue) ? hue : 210, url.searchParams.get("letter") ?? "W"),
      );
      return;
    }

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
    // The mouse glyph on the trigger card animates its press on a three second
    // loop, and a screenshot lands wherever it lands: a stub of a stroke, or a
    // button that happens to be unlit. Reduced motion is not a workaround here
    // but a state the extension ships — the lit button, the raised keycap and
    // the finished stroke, held still — so it is also the frame worth keeping.
    reducedMotion: "reduce",
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      // Every hostname in the strip resolves to the fixture server. The tiles
      // show the host, so the strip needs real hostnames to look like anything
      // at all — and the pages behind them are still ours, served from this
      // process. `EXCLUDE localhost` keeps the loopback name itself resolving
      // normally, which is what Playwright's own plumbing uses.
      `--host-resolver-rules=MAP * 127.0.0.1:${PORT}, EXCLUDE localhost`,
    ],
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
 * `storage.onChanged` re-reads settings on every open tab without a reload, and
 * since BUG-03 that includes the grid's own toggle and size. Callers still
 * reload where a shot depends on more than settings.
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
  const raw = await target.screenshot({ animations: "disabled" });
  await sharp(raw).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toFile(file(locale, name));
  console.log(`  ${locale}/${name}.png`);
}

/**
 * A band of the window, cut out of the 2× frame.
 *
 * Everything the extension draws on a page lives in a closed shadow root, so
 * there is no selector to clip to the way `shootRegion` clips to an options
 * card. The overlay's panels are docked to known edges (§6.4) and the window is
 * a fixed size, so the band is written down here in CSS pixels and multiplied
 * up — checked by eye once, like every other framing decision in this file.
 */
async function shootBand(
  target: Page,
  locale: Locale,
  name: string,
  band: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const raw = await target.screenshot({ animations: "disabled" });
  await sharp(raw)
    .extract({
      left: band.x * SCALE,
      top: band.y * SCALE,
      width: band.width * SCALE,
      height: band.height * SCALE,
    })
    .png()
    .toFile(file(locale, name));
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
    // Finished rather than frozen mid-cycle. The mouse glyph on the trigger
    // card animates a stroke on a loop, and a screenshot taken at an arbitrary
    // moment catches a stub of it, which reads as a rendering fault rather than
    // as a drawing.
    animations: "disabled",
    clip: {
      x,
      y,
      width: Math.min(WIDTH - x, box.width + pad * 2),
      height: Math.min(HEIGHT - y, box.height + pad * 2),
    },
  });
  console.log(`  ${locale}/${name}.png`);
}

interface Leg {
  x: number;
  y: number;
  /**
   * How far the leg bows out from the straight line between its ends, in
   * pixels, positive to the left of travel. Zero would be a ruler.
   */
  bow?: number;
}

/** Deterministic noise in [-1, 1], so a re-run captures the same stroke. */
function wobble(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return (((x ^ (x >>> 14)) >>> 0) / 2 ** 32) * 2 - 1;
  };
}

/** One pass of Chaikin's corner cutting: every corner becomes a short curve. */
function round(points: readonly Point[]): Point[] {
  if (points.length < 3) return [...points];
  const cut: Point[] = [points[0] as Point];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    cut.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    cut.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  cut.push(points[points.length - 1] as Point);
  return cut;
}

/** How far each sample strays from the path, in pixels. A hand is not steady. */
const JITTER = 1.1;

/**
 * A path a hand might have drawn.
 *
 * A gesture captured as a ruled polyline looks like a diagram of a gesture, not
 * a gesture. Three things fix that and none of them is randomness alone: each
 * leg bows out from its straight line, the corners are cut rather than turned
 * on a point, and every sample strays a pixel or so. The noise is seeded, so
 * two runs of the harness still produce the same stroke.
 *
 * The result stays recognisable: the recognizer quantizes by dominant
 * direction, and a bow of a dozen pixels across a leg of two hundred does not
 * change which way that leg went.
 */
function handPath(from: Point, legs: readonly Leg[], seed: number): Point[] {
  const stray = wobble(seed);
  const points: Point[] = [from];
  let at = from;

  for (const leg of legs) {
    const length = Math.hypot(leg.x, leg.y) || 1;
    // Perpendicular to travel, which is the only direction a bow can go.
    const nx = -leg.y / length;
    const ny = leg.x / length;
    const bow = leg.bow ?? 0;
    const steps = 10;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      // A half sine: zero at both ends, so consecutive legs still meet.
      const off = Math.sin(Math.PI * t) * bow;
      points.push({ x: at.x + leg.x * t + nx * off, y: at.y + leg.y * t + ny * off });
    }
    at = { x: at.x + leg.x, y: at.y + leg.y };
  }

  return round(round(points)).map((point) => ({
    x: point.x + stray() * JITTER,
    y: point.y + stray() * JITTER,
  }));
}

/**
 * Draws a stroke and leaves the trigger held, so the caller shoots what is on
 * screen mid-gesture rather than after it has been cleared.
 *
 * Moved point by point rather than jumped: the recognizer quantizes a path, and
 * a single move from one corner to another is one sample, not a stroke.
 */
async function draw(target: Page, from: Point, legs: readonly Leg[], seed: number): Promise<void> {
  const path = handPath(from, legs, seed);
  await target.mouse.move(from.x, from.y);
  await target.mouse.down({ button: "right" });
  for (const point of path) await target.mouse.move(point.x, point.y);
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
    async ({ title, before, after, group }) => {
      // Found by title rather than by URL: `tabs.query` matches URLs as match
      // patterns, which do not see a query string, and the query string is the
      // only thing telling these pages apart.
      const all = await chrome.tabs.query({});
      const self = all.find((tab) => tab.title === title);
      if (self?.id === undefined) throw new Error("the shot tab is not open");

      // A fresh profile is a first install, and a first install opens the
      // welcome page (§10.3). It is captured deliberately later on; left where
      // Chrome put it, it is an eighth tab in a seven-tab strip.
      const greeting = chrome.runtime.getURL("welcome.html");
      for (const tab of all) {
        if (tab.url === greeting && tab.id !== undefined) await chrome.tabs.remove(tab.id);
      }

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

      // The tail of the strip, grouped. Done here rather than in a step of its
      // own because a group is a property of the strip: `tabs.group` wants tab
      // ids from the window they were created in, and this is where those ids
      // are known.
      const laid = await chrome.tabs.query({ windowId });
      const tail = laid
        .slice(-group.size)
        .map((tab) => tab.id)
        .filter((id) => id !== undefined);
      const [head, ...rest] = tail;
      if (head !== undefined && tail.length === group.size) {
        const groupId = await chrome.tabs.group({
          tabIds: [head, ...rest],
          createProperties: { windowId },
        });
        await chrome.tabGroups.update(groupId, { title: group.title, color: group.color });
      }
      return laid.length;
    },
    { title: SHOT.title, before: BEFORE.map(page), after: AFTER.map(page), group: GROUP },
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
    sync: {
      language: locale,
      grid: { ...GRID, enabled: false },
      trail: { ...TRAIL, showLabel: true },
    },
    local: { trigger, uiScale: 1 },
  });

  await shot.bringToFront();
  await shot.reload();
  await shot.waitForTimeout(400);

  // URD — close the tabs to the right. It is the command whose readout says
  // something a static list cannot: how many tabs it would actually close.
  //
  // Drawn low and to the right, over the paper the fixture keeps clear there.
  // The readout is centred, so a stroke through the middle hides the half of
  // itself that says what shape was drawn; and a stroke over a paragraph is
  // honest about what this looks like in use but unreadable at thumbnail size,
  // which is the size a listing image is judged at first.
  await draw(
    shot,
    { x: 690, y: 784 },
    [
      { x: 0, y: -140, bow: 9 },
      { x: 226, y: 6, bow: -11 },
      { x: 8, y: 138, bow: 8 },
    ],
    7,
  );
  await shot.waitForTimeout(250);
  await shoot(shot, locale, "1-gesture");
  await release(shot);

  // 2. The grid, open, with the gesture list under it.
  // The readout is off for this one. The grid is the subject, and a stroke
  // drawn to reach a particular tile is drawn for its endpoint, not its shape —
  // so the readout would sit in the middle of the shot saying "Unassigned".
  await settings(sw, {
    sync: { grid: { ...GRID, enabled: true }, trail: { ...TRAIL, showLabel: false } },
  });
  await shot.reload();
  await shot.waitForTimeout(400);

  // A sweep up onto a tile: releasing over one is how a tab is picked, so the
  // highlight under the pointer is part of what this shot is about. It ends on
  // a tile other than the active one, which is the whole difference the two
  // highlight colours are drawing.
  await draw(
    shot,
    { x: 300, y: 640 },
    [
      { x: 200, y: -140, bow: -46 },
      { x: 140, y: -350, bow: 52 },
    ],
    21,
  );
  // Past holdMs, and past the reveal transition that follows it.
  await shot.waitForTimeout(600);
  await shoot(shot, locale, "2-grid");

  // 6. The gesture list on its own, cut from the same held gesture. It is the
  //    answer to "how would I ever remember these", and in the grid shot it is
  //    a strip along the bottom edge that reads as decoration.
  await shootBand(shot, locale, "6-cheatsheet", CHEATSHEET_BAND);
  await release(shot);

  // The settings back at their shipped defaults before they are photographed:
  // shot 2 turned the readout off to keep it out of the grid frame, and a
  // settings page showing a switch the extension does not ship off is a
  // screenshot of somebody else's configuration.
  await settings(sw, {
    sync: { grid: { ...GRID, enabled: true }, trail: { ...TRAIL, showLabel: true } },
  });

  // 3, 4, 5. The options page. Plain DOM, so these crop by selector.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.waitForTimeout(600);

  await shoot(options, locale, "3-options");

  // 8. The same page, scrolled to the gesture rows, as a whole window.
  //    The cropped card below is README material: a tall crop scaled to fit a
  //    listing image puts 13px interface text at about four pixels, and a
  //    window at listing size is read at close to the size it really is.
  //    Aligned to the top of the card rather than merely brought into view:
  //    `scrollIntoViewIfNeeded` stops as soon as the element's bottom is on
  //    screen, and the bottom of this card is its unassigned commands — a
  //    window full of the word "unassigned" says the opposite of what the
  //    shipped defaults are.
  //    Jumped rather than scrolled: the page carries `scroll-smooth`, so a
  //    `scrollIntoView` here is an animation the screenshot can catch halfway.
  await options.evaluate(() => {
    const card = document.querySelector("#gestures");
    if (!card) throw new Error("the gestures card is not on the page");
    const top = card.getBoundingClientRect().top + window.scrollY - 20;
    window.scrollTo({ top, behavior: "instant" });
  });
  await options.waitForTimeout(400);
  await shoot(options, locale, "8-gestures-window");

  await shootRegion(options, locale, "4-gestures", "#gestures");
  await shootRegion(options, locale, "5-overlay", "#overlay");
  await options.close();

  // 7. The welcome page, which is what a new install actually opens. It names
  //    the trigger for the machine it is running on, lists the strokes that
  //    already work, and carries a pad to try one in — the whole of first run
  //    in one frame.
  const welcome = await context.newPage();
  await welcome.goto(`chrome-extension://${id}/welcome.html`);
  await welcome.waitForTimeout(600);
  await shoot(welcome, locale, "7-welcome");

  // 9. The trigger card off that page, on its own.
  //    The whole window puts a 624px column in the middle of 1280 and then a
  //    listing image scales all of it down; the card alone fills the slide,
  //    and the 2× capture is still above its own pixel count at that width —
  //    so the sentence naming the button is read rather than recognised.
  await shootRegion(welcome, locale, "9-welcome-trigger", "#trigger");
  await welcome.close();

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
