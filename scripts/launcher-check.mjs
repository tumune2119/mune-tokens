// Helper for start-mune-tokens.bat. Exit code 0 = "yes", 1 = "no".
//   node scripts/launcher-check.mjs install   → dependencies missing or package-lock.json changed?
//   node scripts/launcher-check.mjs mark-installed → record the current package-lock.json as installed
//   node scripts/launcher-check.mjs build     → no production build, or sources newer than it?
//   node scripts/launcher-check.mjs running   → is MUNE TOKENS already answering on the port?
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mtime = (p) => {
  try {
    return fs.statSync(path.join(root, p)).mtimeMs;
  } catch {
    return 0;
  }
};

function newestIn(dir) {
  let newest = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  walk(path.join(root, dir));
  return newest;
}

const mode = process.argv[2];

// The installed state is recorded as a hash of package-lock.json (mtimes are unreliable here:
// npm writes its own hidden lockfile slightly before package-lock.json).
const STAMP = path.join(root, "node_modules", ".mune-tokens-lock-hash");
const lockHash = () => {
  try {
    return createHash("sha1").update(fs.readFileSync(path.join(root, "package-lock.json"))).digest("hex");
  } catch {
    return "";
  }
};

if (mode === "install") {
  let stamp = "";
  try {
    stamp = fs.readFileSync(STAMP, "utf8").trim();
  } catch {}
  process.exit(stamp && stamp === lockHash() ? 1 : 0);
}

if (mode === "mark-installed") {
  fs.writeFileSync(STAMP, lockHash());
  process.exit(0);
}

if (mode === "build") {
  const built = mtime(".next/BUILD_ID");
  if (!built) process.exit(0);
  const inputs = [
    newestIn("src"),
    newestIn("public"),
    mtime("package.json"),
    mtime("package-lock.json"),
    mtime("next.config.ts"),
    mtime("postcss.config.mjs"),
    mtime("tsconfig.json"),
  ];
  process.exit(Math.max(...inputs) > built ? 0 : 1);
}

if (mode === "running") {
  const url = process.argv[3] ?? "http://127.0.0.1:5176";
  try {
    const res = await fetch(`${url}/api/app/ping`, { signal: AbortSignal.timeout(2000) });
    const body = await res.text();
    process.exit(res.ok && body.includes("mune-tokens") ? 0 : 1);
  } catch {
    process.exit(1);
  }
}

console.error("usage: launcher-check.mjs install|build|running [url]");
process.exit(2);
