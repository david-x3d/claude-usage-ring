// Injects the usage ring + popup (taken from claude.ai/code) into the composer of /new and /chat/*.
(() => {
  if (globalThis.__CUR_LOADED) return;
  globalThis.__CUR_LOADED = true;

  const { BUTTON, POPUP, ROW, EXTRA } = globalThis.__CUR_MARKUP;
  const { fetchUsage } = globalThis.__CUR_API;
  const { t, plan, resetText, locale } = globalThis.__CUR_I18N;

  const REFRESH_MS = 60_000;
  const AFTER_SEND_MS = [3_000, 15_000, 45_000];
  const CIRCUMFERENCE = 2 * Math.PI * 5; // r=5 as in the original ring
  const DASH = "–";
  const SEND_LABEL = /send|senden|envoy|enviar|invia|verstuur|skicka|wyślij|отправ|送信|发送|傳送|보내/i;

  const state = { data: null, error: false, loaded: false, at: 0 };
  let btnHost, btnRoot, btnEl, popHost, popRoot, popEl;
  let open = false;
  let inflight = null;

  // ---- data -------------------------------------------------------------------------
  function severityOf(pct) {
    return pct >= 90 ? "critical" : pct >= 75 ? "warning" : "normal"; // Cy() in the original
  }
  const barClass = { normal: "bg-fill-accent", warning: "bg-fill-warning", critical: "bg-fill-danger" };
  const ringStroke = { normal: "var(--cds-fill-accent)", warning: "var(--cds-fill-warning)", critical: "var(--cds-fill-danger)" };

  function labelFor(l) {
    if (l.kind === "session") return t("session");
    if (l.kind === "weekly_all") return t("weeklyAll");
    const name = l.scope?.model?.display_name ?? l.scope?.surface?.display_name;
    if (!name) return t("usage");
    return l.group === "weekly" ? t("weeklyProduct", { product: name }) : name;
  }

  function windows() {
    if (!state.data) return [];
    return state.data.limits
      .filter((l) => l.kind !== undefined && !l.scope?.surface?.display_name) // plan windows only (zy)
      .map((l) => {
        const pct = Math.max(0, Math.min(100, l.percent ?? 0));
        const sev = ["normal", "warning", "critical"].includes(l.severity) ? l.severity : severityOf(pct);
        return { label: labelFor(l), pct, sev, resetsAt: l.resets_at };
      });
  }

  function peak(ws) {
    return ws.reduce((a, w) => (a === null || w.pct > a.pct ? w : a), null);
  }

  async function refresh() {
    if (inflight) return inflight;
    inflight = fetchUsage()
      .then((d) => {
        state.data = d;
        state.error = false;
      })
      .catch(() => {
        state.error = true;
      })
      .finally(() => {
        state.loaded = true;
        state.at = Date.now();
        inflight = null;
        render();
      });
    return inflight;
  }

  // ---- rendering ----------------------------------------------------------------------
  const slot = (root, name) => root.querySelector(`[data-slot="${name}"]`);

  function render() {
    if (!btnEl) return;
    const ws = windows();
    const p = state.error || !state.data ? null : peak(ws);
    const pct = p ? Math.round(p.pct) : 0;

    const ring = slot(btnEl, "ring");
    ring.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE * (1 - pct / 100)));
    ring.setAttribute("stroke", ringStroke[p?.sev ?? "normal"]);
    const reset = p ? resetText(p.resetsAt) : null;
    btnEl.setAttribute(
      "aria-label",
      p ? `${t("usage")}: ${p.label}: ${pct}%${reset ? ` · ${reset}` : ""}` : `${t("usage")}: ${DASH}`
    );

    renderPopup(ws);
  }

  function renderPopup(ws) {
    if (!popEl) return;
    const team = state.data && (state.data.tier === "team" || state.data.tier === "enterprise");
    slot(popEl, "sr-title").textContent = t("usage");
    slot(popEl, "settings-link").setAttribute("aria-label", t("viewSettings"));
    slot(popEl, "heading").textContent = [team ? t("yourLimits") : t("planLimits"), state.data ? plan(state.data.tier) : null]
      .filter(Boolean)
      .join(" · ");

    const rows = slot(popEl, "rows");
    rows.textContent = "";
    const broken = state.error || !state.data;
    const list = ws.length ? ws : [{ label: t("usage"), pct: 0, sev: "normal", resetsAt: null }];

    list.forEach((w, i) => {
      const row = document.createElement("div");
      row.innerHTML = ROW;
      const el = row.firstElementChild;
      const id = `cur-row-${i}`;
      const label = slot(el, "label");
      label.id = id;
      label.textContent = w.label;
      slot(el, "reset").textContent = broken ? "" : resetText(w.resetsAt) ?? "";
      slot(el, "pct").textContent = broken ? DASH : `${Math.round(w.pct)}%`;
      const bar = slot(el, "bar");
      const track = bar.parentElement;
      track.setAttribute("aria-labelledby", id);
      track.setAttribute("aria-valuenow", String(broken ? 0 : Math.round(w.pct)));
      bar.className = `h-full ${barClass[w.sev]} transition-[width]`;
      bar.style.width = broken ? "0%" : `${w.pct}%`;
      rows.appendChild(el);
    });

    const x = state.data?.extraUsage;
    if (!broken && x && x.is_enabled && x.used_credits !== null && x.used_credits !== undefined) {
      const money = (c) =>
        new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100);
      const row = document.createElement("div");
      row.innerHTML = EXTRA;
      const el = row.firstElementChild;
      const id = "cur-extra";
      const label = slot(el, "label");
      label.id = id;
      label.textContent = t("usageCredits");
      slot(el, "value").textContent =
        x.monthly_limit == null ? t("spent", { used: money(x.used_credits) }) : t("usedOf", { used: money(x.used_credits), limit: money(x.monthly_limit) });
      const pct = x.monthly_limit == null ? null : x.monthly_limit === 0 ? 100 : Math.max(0, Math.min(100, (x.used_credits / x.monthly_limit) * 100));
      const track = slot(el, "track");
      if (pct === null) track.remove();
      else {
        track.setAttribute("aria-labelledby", id);
        track.setAttribute("aria-valuenow", String(Math.round(pct)));
        const bar = slot(el, "bar");
        bar.className = `h-full ${barClass[severityOf(pct)]} transition-[width]`;
        bar.style.width = `${pct}%`;
      }
      rows.appendChild(el);
    }
    if (open) position();
  }

  // ---- DOM construction ---------------------------------------------------------------
  function makeHost(id, html, hostStyle) {
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = hostStyle;
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = globalThis.__CUR_CSS;
    const wrap = document.createElement("div");
    wrap.className = "cds-root";
    wrap.style.display = "contents";
    wrap.innerHTML = html;
    root.append(style, wrap);
    return { host, root, wrap };
  }

  function build() {
    if (btnHost) return;
    const b = makeHost("cur-usage-ring", BUTTON, "display:inline-flex;flex:none;align-items:center;");
    btnHost = b.host;
    btnRoot = b.root;
    btnEl = btnRoot.querySelector("button");
    btnEl.addEventListener("click", () => (open ? close() : openPopup()));

    const p = makeHost("cur-usage-popup", POPUP, "position:fixed;top:0;left:0;z-index:2147483000;display:none;");
    popHost = p.host;
    popRoot = p.root;
    popEl = popRoot.querySelector('[data-cds="Popover"]');
    popEl.setAttribute("aria-labelledby", "cur-popup-title");
    slot(popEl, "sr-title").id = "cur-popup-title";
    btnEl.setAttribute("aria-controls", "cur-usage-popup");
    btnHost._wrap = b.wrap;
    popHost._wrap = p.wrap;
    render();
  }

  // Theme variables (--cds-*) live on .cds-root[data-mode…]; mirror the page's own values.
  function syncTheme(ref) {
    const src = ref.closest(".cds-root") ?? document.querySelector(".cds-root") ?? document.documentElement;
    for (const host of [btnHost, popHost]) {
      const w = host._wrap;
      for (const a of ["data-mode", "data-theme", "data-font"]) {
        const v = src.getAttribute(a) ?? document.documentElement.getAttribute(a);
        if (v === null) w.removeAttribute(a);
        else if (w.getAttribute(a) !== v) w.setAttribute(a, v);
      }
    }
  }

  // ---- popup behaviour ----------------------------------------------------------------
  function position() {
    const r = btnEl.getBoundingClientRect();
    popHost.style.display = "block";
    popHost.style.setProperty("--available-height", `${Math.max(120, innerHeight - 16)}px`);
    const w = popEl.offsetWidth;
    const h = popEl.offsetHeight;
    const above = r.top - 8 >= h || r.top > innerHeight - r.bottom;
    const top = above ? Math.max(8, r.top - 8 - h) : Math.min(innerHeight - h - 8, r.bottom + 8);
    const left = Math.min(Math.max(8, r.right - w), Math.max(8, innerWidth - w - 8)); // side=top, align=end
    popHost.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function openPopup() {
    open = true;
    btnEl.setAttribute("aria-expanded", "true");
    renderPopup(windows());
    position();
    popEl.focus({ preventScroll: true });
    refresh(); // the original refetches when the popup opens
  }

  function close(returnFocus = false) {
    if (!open) return;
    open = false;
    btnEl.setAttribute("aria-expanded", "false");
    popHost.style.display = "none";
    if (returnFocus) btnEl.focus({ preventScroll: true });
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!open) return;
      const path = e.composedPath();
      if (!path.includes(btnHost) && !path.includes(popHost)) close();
    },
    true
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        close(true);
      }
    },
    true
  );
  addEventListener("resize", () => open && position());
  addEventListener("scroll", () => open && position(), true);

  // ---- placement ----------------------------------------------------------------------
  const isChatPath = () => /^\/(new|chat\/[^/]+)\/?$/.test(location.pathname);

  function findAnchor() {
    const model = document.querySelector('[data-testid="model-selector-dropdown"]');
    if (model) return model;
    // fallback: sit in front of the composer's submit button
    const input = document.querySelector('[data-testid="chat-input"], [role="textbox"][contenteditable="true"]');
    const form = input?.closest("form, fieldset") ?? input?.parentElement?.parentElement?.parentElement;
    const send = form && [...form.querySelectorAll("button")].reverse().find((b) => b.type === "submit" || SEND_LABEL.test(b.getAttribute("aria-label") || ""));
    return send?.previousElementSibling ?? null;
  }

  function detach() {
    close();
    btnHost?.remove();
    popHost?.remove();
  }

  function ensure() {
    if (!isChatPath() || document.querySelector('[data-testid="chat-context-ring"]')) return detach();
    const anchor = findAnchor();
    if (!anchor) return detach();
    const first = !btnHost;
    build();
    if (!btnHost.isConnected || btnHost.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", btnHost);
    if (!popHost.isConnected) document.body.appendChild(popHost);
    syncTheme(anchor);
    if (first || !state.loaded) refresh();
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      ensure();
    }, 50);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---- refresh triggers ---------------------------------------------------------------
  setInterval(() => {
    if (btnHost?.isConnected && !document.hidden) refresh();
  }, REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && btnHost?.isConnected && Date.now() - state.at > 30_000) refresh();
  });

  const afterSend = () => AFTER_SEND_MS.forEach((ms) => setTimeout(() => btnHost?.isConnected && refresh(), ms));
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const el = e.target;
      if (el instanceof Element && el.closest('[contenteditable="true"], textarea') && (el.textContent || "").trim()) afterSend();
    },
    true
  );
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target instanceof Element ? e.target.closest("button") : null;
      if (b && (b.type === "submit" || SEND_LABEL.test(b.getAttribute("aria-label") || ""))) afterSend();
    },
    true
  );

  ensure();
})();
