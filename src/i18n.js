// Strings come from claude.ai's own message catalogs (see src/locales.json, inlined as locales.js at build time).
(() => {
  const catalogs = globalThis.__CUR_LOCALES;
  const FALLBACK = "en-US";

  // <html lang> is one of Claude's UI languages; match exactly, then by language prefix.
  function pickCatalog() {
    const tag = (document.documentElement.lang || navigator.language || FALLBACK).toLowerCase();
    const keys = Object.keys(catalogs);
    const exact = keys.find((k) => k.toLowerCase() === tag);
    if (exact) return catalogs[exact];
    const lang = tag.split("-")[0];
    const byLang = keys.find((k) => k.toLowerCase().split("-")[0] === lang);
    return catalogs[byLang ?? FALLBACK];
  }

  const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const locale = () => document.documentElement.lang || navigator.language || FALLBACK;
  const t = (key, vars = {}) => fmt(pickCatalog()[key] ?? catalogs[FALLBACK][key], vars);
  const plan = (tier) => pickCatalog()[`plans.${tier}`] ?? catalogs[FALLBACK][`plans.${tier}`] ?? tier;

  // Same rules as claude.ai: <1 h and <24 h relative; otherwise weekday + time (>=7 days: date + time)
  function resetText(resetsAt, now = Date.now()) {
    const ms = Date.parse(resetsAt);
    if (!Number.isFinite(ms) || ms <= now) return null;
    const reset = new Date(Math.round(ms / 6e4) * 6e4);
    const total = Math.floor(Math.max(0, reset.getTime() - now) / 6e4);
    if (total < 60) return t("resetsInMin", { minutes: total });
    if (total < 1440) return t("resetsInHrMin", { hours: Math.floor(total / 60), minutes: total % 60 });
    const opts =
      total >= 10080
        ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
        : { weekday: "short", hour: "numeric", minute: "2-digit" };
    let time;
    try {
      time = new Intl.DateTimeFormat(locale(), opts).format(reset);
    } catch {
      time = new Intl.DateTimeFormat(FALLBACK, opts).format(reset);
    }
    return t("resetsAt", { time });
  }

  globalThis.__CUR_I18N = { t, plan, resetText, locale };
})();
