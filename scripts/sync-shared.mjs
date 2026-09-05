// Copies the canonical rule files in /shared into the places that bundle them.
// Run from the repo root: node scripts/sync-shared.mjs
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "shared");
const targets = [join(root, "web", "shared"), join(root, "supabase", "functions", "_shared", "rules")];

for (const target of targets) {
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(src).filter((f) => f.endsWith(".json"))) {
    copyFileSync(join(src, file), join(target, file));
  }
  console.log(`synced -> ${target}`);
}
