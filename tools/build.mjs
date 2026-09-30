// Assembles dist/firefox and dist/chrome from src/, manifests/ and build/shadow-css.js.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...a) => join(root, ...a);

if (!existsSync(p("build", "shadow-css.js"))) {
  console.error("build/shadow-css.js is missing. Run:  npm run css -- <stylesheet URL> <stylesheet URL>   (see README)");
  process.exit(1);
}

const locales = JSON.parse(readFileSync(p("src", "locales.json"), "utf8"));
const localesJs = "globalThis.__CUR_LOCALES=" + JSON.stringify(locales) + ";\n";
const scripts = ["content.js", "usage-api.js", "markup.js", "i18n.js"];

for (const target of ["firefox", "chrome"]) {
  const out = p("dist", target);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of scripts) cpSync(p("src", f), join(out, f));
  cpSync(p("build", "shadow-css.js"), join(out, "shadow-css.js"));
  writeFileSync(join(out, "locales.js"), localesJs);
  cpSync(p("assets", "icons"), join(out, "icons"), { recursive: true });
  cpSync(p("manifests", `${target}.json`), join(out, "manifest.json"));
  console.log(`dist/${target} ready`);
}
