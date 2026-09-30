# Claude Usage Ring

A small browser extension that brings the round **usage button and popup from `claude.ai/code`** into the
composer of regular claude.ai chats (`/new` and `/chat/*`). It shows your plan limits (5-hour and weekly
windows, plus usage credits if enabled) and nothing about tokens or the context window.

- Firefox (and forks such as Floorp) and Chrome / Chromium, Manifest V3
- Looks identical to the original: same markup and the same compiled CSS rules, isolated in a Shadow DOM
- Supports all languages Claude's UI offers: English, Français, Deutsch, हिन्दी, Bahasa Indonesia, Italiano,
  日本語, 한국어, Português (Brasil), Español (Latinoamérica), Español (España)
- Only talks to `claude.ai` with your existing session. No analytics, no third parties.

<p align="center">
  <img src="docs/screenshot-closed.png" alt="Usage ring in the claude.ai composer" width="49%">
  <img src="docs/screenshot-popup.png" alt="Open usage popup with 5-hour and weekly limits" width="49%">
</p>

> **Unofficial.** Not affiliated with or endorsed by Anthropic. It uses the same internal, undocumented endpoint
> as claude.ai itself (`GET /api/organizations/{id}/usage`), which can change at any time.

## How it behaves

- Click the ring to open the popup; click outside or press `Esc` to close it.
- The ring shows the highest usage among your plan windows and turns yellow/red near the limit.
- Refreshes every 60 s (visible tab only), when the popup opens, after you send a prompt, and when you return to the tab.
- On errors the ring is empty and values show `–`.
- If your account already shows the native ring in the composer, the extension stays out of the way.

## Install from source

The original stylesheet is Anthropic's, so it is **not** committed here. You generate it from the public
stylesheets that claude.ai serves to you:

1. Open <https://claude.ai> in your browser, open DevTools → Console and run
   ```js
   [...document.styleSheets].map(s => s.href).filter(Boolean)
   ```
2. Copy the URLs ending in `.css` (at the time of writing two files on `assets-proxy.anthropic.com`).
3. Build (Node 18+):
   ```sh
   npm run css -- <css-url-1> <css-url-2>
   npm run build
   ```
   `npm run css` keeps only the rules for the classes used in `src/markup.js`. You can also pass local `.css` files.
   Re-run it when claude.ai changes its design.

This creates `dist/firefox` and `dist/chrome`.

### Firefox / Floorp

Temporary: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `dist/firefox/manifest.json`.
Or, with [web-ext](https://github.com/mozilla/web-ext): `npm run start:firefox`
(`web-ext run --firefox=floorp …` for Floorp). Temporary add-ons are removed on restart; a permanent install needs
a signed build (`npm run pack:firefox`, then sign via AMO) or a Firefox build that allows unsigned add-ons.

### Permanent Firefox install (signed, unlisted)

Release Firefox only runs signed add-ons permanently. Mozilla signs unlisted add-ons for free; the result is a private `.xpi`:

1. Create API credentials at <https://addons.mozilla.org/developers/addon/api/key/> and export them in your shell
   (`WEB_EXT_API_KEY`, `WEB_EXT_API_SECRET`; never commit them).
2. Bump `version` in `manifests/firefox.json` (and `package.json`) for every new signature.
3. `npm run sign:firefox` → builds, signs and writes `web-ext-artifacts/*.xpi`.
4. In Firefox: `about:addons` → gear icon → **Install Add-on From File…**

The signed `.xpi` contains Anthropic's stylesheet, so keep it private: it is git-ignored and must not go into releases.

### Chrome / Chromium / Edge

`chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `dist/chrome`.

## Project layout

| Path | Purpose |
|---|---|
| `src/content.js` | Injection (MutationObserver), popup behaviour, refresh logic |
| `src/usage-api.js` | The only network code: `GET /api/organizations`, `GET /api/organizations/{id}/usage` (same-origin, `credentials: "include"`) |
| `src/markup.js` | Markup of button and popup, taken from claude.ai/code |
| `src/i18n.js`, `src/locales.json` | Strings copied from claude.ai's message catalogs, plus reset-time formatting |
| `tools/build-css.mjs` | Extracts the needed CSS rules from claude.ai's stylesheets |
| `tools/build.mjs` | Assembles `dist/firefox` and `dist/chrome` |
| `manifests/` | One manifest per browser |

### Adding or updating a language

Catalogs live at `https://claude.ai/i18n/<locale>.json` (e.g. `de-DE`). The 19 message IDs used are listed in
`src/locales.json` keys; copy the values for a new locale from the catalog and add it there.

## Permissions

`https://claude.ai/*` only (content script and same-origin requests). No background page, no storage, no other hosts.

## Known limitations

- The plan name ("Pro", "Max (5x)", …) is derived from fields of `/api/organizations` and may be wrong for unusual plans.
- After sending a prompt the usage is re-fetched after 3, 15 and 45 seconds rather than exactly when the answer ends.
- The popup has no open/close animation and no hover tooltip on the button.
- Anchoring depends on the composer's model selector (`data-testid="model-selector-dropdown"`); if claude.ai renames it,
  a fallback next to the send button is used.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT for this project's code. The markup structure and CSS are Anthropic's and are fetched from claude.ai at build time.
