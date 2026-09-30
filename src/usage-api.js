// All network access of the extension lives here: same-origin GET against claude.ai, cookies included.
// Endpoint taken from claude.ai's own bundle: GET /api/organizations/{orgUuid}/usage
(() => {
  let orgPromise = null;

  async function getJson(path) {
    const res = await fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  function lastActiveOrgFromCookie() {
    try {
      const m = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }

  async function resolveOrg() {
    const orgs = await getJson("/api/organizations");
    if (!Array.isArray(orgs) || !orgs.length) throw new Error("no organization");
    const wanted = lastActiveOrgFromCookie();
    return (
      orgs.find((o) => o.uuid === wanted) ||
      orgs.find((o) => (o.capabilities || []).includes("chat")) ||
      orgs[0]
    );
  }

  // Plan tier as the original derives it (enterprise > team > max > pro > free).
  function planTier(org) {
    const caps = org.capabilities || [];
    if (org.raven_type === "enterprise") return "enterprise";
    if (org.raven_type === "team") return "team";
    if (caps.includes("claude_max")) return /20x/.test(org.rate_limit_tier || "") ? "max20x" : "max5x";
    if (caps.includes("claude_pro")) return "pro";
    return "free";
  }

  // Returns { tier, limits: [{kind, percent, severity, resets_at, scope}], extraUsage }
  async function fetchUsage() {
    orgPromise ??= resolveOrg().catch((e) => {
      orgPromise = null;
      throw e;
    });
    const org = await orgPromise;
    let data;
    try {
      data = await getJson(`/api/organizations/${encodeURIComponent(org.uuid)}/usage`);
    } catch (e) {
      orgPromise = null; // org may have changed (account switch)
      throw e;
    }
    if (!Array.isArray(data.limits)) throw new Error("unexpected usage payload");
    return { tier: planTier(org), limits: data.limits, extraUsage: data.extra_usage ?? null };
  }

  globalThis.__CUR_API = { fetchUsage };
})();
