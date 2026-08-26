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
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = next;
  // package-lock carries the version twice.
  if (json.packages?.[""]) json.packages[""].version = next;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

console.log(`${current} -> ${next}`);
