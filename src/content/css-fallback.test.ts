import assert from "node:assert/strict";
import { test } from "node:test";
import { withPropertyFallback } from "./css-fallback.ts";

test("turns registrations into declarations every element can read", () => {
  const css = `@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}
.border{border-style:var(--tw-border-style);border-width:1px}`;
  const out = withPropertyFallback(css);
  assert.ok(out.includes("*,::before,::after,::backdrop{--tw-border-style:solid}"));
  // The original sheet is kept: the registrations still apply wherever the
  // stylesheet is used in a document rather than a shadow root.
  assert.ok(out.includes(".border{border-style:var(--tw-border-style)"));
});

test("skips registrations that have no initial value", () => {
  const css = `@property --tw-shadow{syntax:"*";inherits:false}`;
  assert.equal(withPropertyFallback(css), css);
});

test("collects every registration in the sheet", () => {
  const css = [
    "@property --tw-border-style{syntax:'*';inherits:false;initial-value:solid}",
    "@property --tw-scale-x{syntax:'*';inherits:false;initial-value:1}",
  ].join("\n");
  const out = withPropertyFallback(css);
  assert.ok(out.endsWith("*,::before,::after,::backdrop{--tw-border-style:solid;--tw-scale-x:1}"));
});

test("leaves a sheet with no registrations untouched", () => {
  const css = ".border{border-width:1px}";
  assert.equal(withPropertyFallback(css), css);
});
