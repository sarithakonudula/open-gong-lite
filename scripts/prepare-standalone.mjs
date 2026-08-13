/**
 * After `next build`, copy assets Next's standalone output does not include.
 * Needed for `npm start` / Railpack deploys that run `.next/standalone/server.js`.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

function mustExist(path, label) {
  if (!existsSync(path)) {
    throw new Error(`prepare-standalone: missing ${label} at ${path}`);
  }
}

mustExist(standalone, "standalone output");
mustExist(join(root, "public"), "public/");
mustExist(join(root, ".next", "static"), ".next/static");
mustExist(join(root, "sample-calls"), "sample-calls/");

cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});
cpSync(join(root, "sample-calls"), join(standalone, "sample-calls"), {
  recursive: true,
});
mkdirSync(join(standalone, "data", "runs"), { recursive: true });

console.log("prepare-standalone: public, static, sample-calls → .next/standalone");
