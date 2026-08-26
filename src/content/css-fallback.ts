/**
 * Tailwind v4 declares its internal variables with `@property`, and utilities
 * read them: `.border` emits `border-style: var(--tw-border-style)` and relies
 * on the registration's `initial-value: solid`.
 *
 * Registrations are document-global, and the CSS Properties and Values spec has
 * them ignored inside a shadow tree. Our stylesheet is only ever adopted into
 * the overlay's closed shadow root, so none of those registrations take effect:
 * every `var()` resolves to nothing and `border-style` falls back to `none` —
 * borders vanish, transforms and shadows go with them.
 *
 * Tailwind ships its own fallback for browsers without `@property` support, but
 * it sits behind an `@supports` test that Chrome passes, so it never applies
 * here. This rebuilds the same thing unconditionally from the registrations in
 * the sheet: one low-specificity rule per element, which any utility that sets
 * the variable itself still overrides.
 *
 * Kept separate from `overlay.ts` so it can be tested without importing CSS.
 */
export function withPropertyFallback(css: string): string {
  const declarations: string[] = [];

  for (const [, name, body] of css.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)) {
    // A registration with no initial-value has nothing to fall back to: the
    // variable is invalid either way, registered or not.
    const initial = /initial-value:\s*([^;}]+)/.exec(body ?? "")?.[1]?.trim();
    if (name && initial) declarations.push(`${name}:${initial}`);
  }

  if (declarations.length === 0) return css;
  // ::backdrop is included for the same reason Tailwind includes it: it does
  // not inherit from the tree.
  return `${css}\n*,::before,::after,::backdrop{${declarations.join(";")}}`;
}
