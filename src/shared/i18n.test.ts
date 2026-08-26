import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { COMMANDS } from "./commands.ts";

interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const root = new URL("../public/_locales/", import.meta.url);

function load(locale: string): Record<string, Entry> {
  return JSON.parse(readFileSync(new URL(`${locale}/messages.json`, root), "utf8"));
}

const locales = readdirSync(root);
const en = load("en");

test("english is the default locale and carries every key", () => {
  assert.ok(locales.includes("en"));
  assert.ok(Object.keys(en).length > 0);
});

test("every translation has exactly the english key set", () => {
  for (const locale of locales.filter((name) => name !== "en")) {
    const messages = load(locale);
    const missing = Object.keys(en).filter((key) => !(key in messages));
    const extra = Object.keys(messages).filter((key) => !(key in en));
    assert.deepEqual(missing, [], `${locale} is missing keys`);
    assert.deepEqual(extra, [], `${locale} has keys english does not`);
  }
});

test("every locale name is a tag Intl accepts once underscores become hyphens", () => {
  // Chrome names these directories with an underscore — zh_TW — and that is the
  // identifier stored in settings. Intl wants BCP 47 and throws
  // "invalid language tag" on the underscore, so i18n.ts converts before use.
  for (const locale of locales) {
    assert.doesNotThrow(() => new Intl.NumberFormat(locale.replaceAll("_", "-")));
  }
});

test("placeholders survive translation", () => {
  for (const locale of locales.filter((name) => name !== "en")) {
    const messages = load(locale);
    for (const [key, entry] of Object.entries(en)) {
      const names = Object.keys(entry.placeholders ?? {}).toSorted();
      const translated = Object.keys(messages[key]?.placeholders ?? {}).toSorted();
      assert.deepEqual(translated, names, `${locale}/${key} placeholders differ`);
      for (const name of names) {
        // A dropped $NAME$ in the string leaves the substitution unrendered.
        assert.ok(
          messages[key]?.message.includes(`$${name.toUpperCase()}$`),
          `${locale}/${key} does not use $${name.toUpperCase()}$`,
        );
      }
    }
  }
});

/** docs/wording.md: plain statements, no filler, no chatty asides. */
const BANNED_EN = [
  "actually",
  "simply",
  "really",
  "thrown away",
  "pops up",
  "flash",
  "puzzle",
  "!",
];

/** docs/wording.md: third-person and objective, no colloquial word choices. */
const BANNED_ZH = ["你", "妳", "拿不到", "跑掉", "一閃", "!", "！"];

test("english copy avoids filler and asides", () => {
  for (const [key, entry] of Object.entries(en)) {
    const message = entry.message.toLowerCase();
    for (const word of BANNED_EN) {
      assert.ok(!message.includes(word), `${key} uses “${word}”: ${entry.message}`);
    }
  }
});

test("chinese copy stays third-person and formal", () => {
  const messages = load("zh_TW");
  for (const [key, entry] of Object.entries(messages)) {
    for (const word of BANNED_ZH) {
      assert.ok(!entry.message.includes(word), `${key} uses “${word}”: ${entry.message}`);
    }
  }
});

/** One concept, one word. A stroke with no command is always "unassigned". */
test("english copy does not say unbound", () => {
  for (const [key, entry] of Object.entries(en)) {
    assert.ok(!entry.message.toLowerCase().includes("unbound"), `${key} says “unbound”`);
  }
});

test("every command label has a message", () => {
  for (const command of Object.values(COMMANDS)) {
    assert.ok(command.labelKey in en, `${command.labelKey} is missing from english`);
  }
});
