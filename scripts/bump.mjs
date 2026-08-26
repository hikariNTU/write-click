import { readFileSync, writeFileSync } from "node:fs";

/**
 * Bumps the version in every file that carries one. They must agree: Chrome
 * reads the manifest, the release workflow reads package.json, and a mismatch
 * ships a build tagged as something it is not.
 *
 *   node scripts/bump.mjs patch|minor|major
 */
const type = process.argv[2];
if (!["patch", "minor", "major"].includes(type)) {
  console.error("usage: node scripts/bump.mjs patch|minor|major");
  process.exit(1);
}

const files = ["package.json", "package-lock.json", "src/manifest.json"];
const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const [major, minor, patch] = current.split(".").map(Number);

const next =
  type === "major"
    ? `${major + 1}.0.0`
    : type === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const json = JSON.parse(source);
  if (json.version !== current) {
    console.error(`${file} is at ${json.version}, expected ${current}`);
    process.exit(1);
  }
  // Rewrites the version in place rather than re-serialising the file. A
  // JSON.stringify round-trip reformats everything it touches — it expanded the
  // manifest's inline arrays and broke format:check in CI — and package-lock is
  // far too large to reflow over a three-character change.
  let out = source.replace(/"version": "[^"]+"/, `"version": "${next}"`);
  // package-lock carries the version twice: once at the root, once for the
  // root package entry.
  if (json.packages?.[""]) {
    out = out.replace(/("packages": \{\s*"": \{[^}]*?"version": ")[^"]+"/, `$1${next}"`);
  }
  writeFileSync(file, out);
}

console.log(`${current} -> ${next}`);
