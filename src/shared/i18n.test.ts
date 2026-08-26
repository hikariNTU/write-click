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

test("every command label has a message", () => {
  for (const command of Object.values(COMMANDS)) {
    assert.ok(command.labelKey in en, `${command.labelKey} is missing from english`);
  }
});
