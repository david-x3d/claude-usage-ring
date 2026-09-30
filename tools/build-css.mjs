// Extracts, from claude.ai's compiled stylesheets, exactly the rules whose selectors
// reference a class used in src/markup.js, and writes them to build/shadow-css.js (unchanged rule text).
// Usage: node tools/build-css.mjs <stylesheet URL or local file> [...]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("usage: node tools/build-css.mjs <stylesheet URL or file> [...]  (see README, 'Get the stylesheets')");
  process.exit(1);
}
async function load(src) {
  if (!/^https:\/\//.test(src)) return readFileSync(src, "utf8");
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
  return res.text();
}

// ---- collect class tokens from markup.js ------------------------------------
const markup = readFileSync(join(root, "src", "markup.js"), "utf8");
const tokens = new Set();
for (const m of markup.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach((t) => tokens.add(t));
for (const m of markup.matchAll(/\/\*\s*classes:([^*]*)\*\//g)) m[1].split(/\s+/).filter(Boolean).forEach((t) => tokens.add(t));

const esc = (t) => t.replace(/[^A-Za-z0-9_-]/g, (c) => "\\" + c);
const needles = [...tokens].map((t) => "." + esc(t));
const isIdent = (c) => c !== undefined && /[A-Za-z0-9_-]/.test(c);
// design-system scope/attribute hooks (theme variables live on .cds-root / [data-mode]; icon font on [data-cds=Icon])
const attrNeedles = [":host", "[data-cds", "[data-mode", "[data-theme", "[data-font", "[data-cds-"];
function selectorMatches(sel) {
  if (attrNeedles.some((n) => sel.includes(n))) return true;
  for (const n of needles) {
    let i = -1;
    while ((i = sel.indexOf(n, i + 1)) !== -1) if (!isIdent(sel[i + n.length])) return true;
  }
  return false;
}

// ---- tiny CSS block splitter --------------------------------------------------
function split(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    let j = i, depth = 0, q = null;
    for (; j < css.length; j++) {
      const c = css[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
      if (c === "\\") { j++; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { j++; break; } }
      else if (c === ";" && depth === 0) { j++; break; }
    }
    const chunk = css.slice(i, j);
    i = j;
    const b = chunk.indexOf("{");
    if (b === -1) { if (chunk.trim()) out.push({ prelude: chunk.trim().replace(/;$/, ""), body: null }); continue; }
    out.push({ prelude: chunk.slice(0, b).trim(), body: chunk.slice(b + 1, chunk.lastIndexOf("}")) });
  }
  return out;
}

const plainBase = (sel) => !/[.#]/.test(sel.replace(/\[[^\]]*\]/g, "")); // preflight-style tag rules
function filter(css, inBase) {
  let out = "";
  for (const { prelude, body } of split(css)) {
    if (body === null) continue; // @layer order statements, @import, @charset
    if (prelude.startsWith("@")) {
      const name = prelude.split(/[\s({]/)[0];
      if (name === "@property" || name === "@font-face" || name === "@keyframes") continue;
      const isBase = inBase || prelude === "@layer base";
      const inner = filter(body, isBase);
      if (inner) out += `${prelude}{${inner}}`;
      continue;
    }
    if (selectorMatches(prelude) || (inBase && plainBase(prelude))) out += `${prelude}{${body}}`;
  }
  return out;
}

let css = "@layer theme, base, components, utilities;";
for (const src of inputs) css += filter(await load(src), false);
mkdirSync(join(root, "build"), { recursive: true });
writeFileSync(join(root, "build", "shadow-css.js"), "globalThis.__CUR_CSS=" + JSON.stringify(css) + ";\n");
console.log(`${tokens.size} classes -> build/shadow-css.js (${css.length} bytes)`);
