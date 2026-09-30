// Builds dist/firefox and signs it as an unlisted add-on via Mozilla (web-ext sign).
// Credentials are read by web-ext from WEB_EXT_API_KEY / WEB_EXT_API_SECRET; this script never reads or prints them.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "web-ext-artifacts");
const stateFile = join(artifacts, ".last-signed-version");

const fail = (msg) => {
  console.error(`sign: ${msg}`);
  process.exit(1);
};

for (const name of ["WEB_EXT_API_KEY", "WEB_EXT_API_SECRET"]) {
  if (!process.env[name]) fail(`${name} is not set in the environment (get both from https://addons.mozilla.org/developers/addon/api/key/).`);
}

// Version must be strictly higher than the last signed one (dotted numeric compare).
const version = JSON.parse(readFileSync(join(root, "manifests", "firefox.json"), "utf8")).version;
const parts = (v) => v.split(".").map((n) => parseInt(n, 10) || 0);
const cmp = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
if (existsSync(stateFile)) {
  const last = readFileSync(stateFile, "utf8").trim();
  if (cmp(version, last) <= 0) fail(`manifest version ${version} is not higher than the last signed version ${last}. Bump "version" in manifests/firefox.json (and package.json).`);
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
  if (r.status !== 0) fail(`${cmd} ${args[0]} failed (exit ${r.status}).`);
};

run(process.execPath, ["tools/build.mjs"]);
mkdirSync(artifacts, { recursive: true });
run("npx", ["--yes", "web-ext", "sign", "--source-dir", "dist/firefox", "--artifacts-dir", "web-ext-artifacts", "--channel", "unlisted"]);

writeFileSync(stateFile, version + "\n");
const xpis = readdirSync(artifacts).filter((f) => f.endsWith(".xpi")).map((f) => join(artifacts, f));
xpis.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
console.log(`\nSigned ${version}: ${xpis[0] ?? "(no .xpi found in web-ext-artifacts/)"}`);
