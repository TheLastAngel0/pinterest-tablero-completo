(() => {
  "use strict";
  let running = false;
  let cancelled = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type === "cancel") {
      cancelled = true;
      reply({ ok: true });
      return;
    }
    if (message?.type !== "start") return;
    if (running) {
      reply({ ok: false, error: "Ya hay una descarga en curso en esta pestaña." });
      return;
    }
    if (!isBoardPage()) {
      reply({ ok: false, error: "Abre la página de un tablero, no la vista de un pin o el inicio." });
      return;
    }
    running = true;
    cancelled = false;
    reply({ ok: true });
    run(Math.min(100000, Math.max(0, Number(message.expected) || 0)))
      .catch(error => publish({ running: false, phase: "Error", detail: String(error?.message || error) }))
      .finally(() => { running = false; });
  });

  function isBoardPage() {
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.length >= 2 && !["pin", "search", "ideas", "today", "settings", "_"].includes(parts[0].toLowerCase());
  }

  function boardSlug() {
    return location.pathname.split("/").filter(Boolean).slice(0, 3)
      .join("_").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "tablero";
  }

  async function publish(state) {
    const tab = await chrome.runtime.sendMessage({ type: "getTabId" }).catch(() => null);
    if (tab?.tabId) await chrome.storage.local.set({ [`job:${tab.tabId}`]: state });
  }

  function mediaCandidates(element) {
    const out = [];
    const add = raw => {
      try {
        const url = new URL(raw, location.href);
        if (url.protocol !== "https:" || !url.hostname.endsWith(".pinimg.com")) return;
        if (!out.includes(url.href)) out.push(url.href);
      } catch { /* ignore */ }
    };
    for (const video of element.querySelectorAll("video")) {
      add(video.currentSrc || video.src);
      for (const source of video.querySelectorAll("source")) add(source.src);
    }
    for (const img of element.querySelectorAll("img")) {
      add(img.currentSrc || img.src);
      add(img.src);
      for (const part of (img.getAttribute("srcset") || "").split(",")) add(part.trim().split(/\s+/)[0]);
    }
    return out;
  }

  function bestCandidate(urls) {
    const score = value => {
      if (/\.mp4(?:\?|$)/i.test(value)) return 2000;
      const size = value.match(/\/(originals|1200x|736x|564x|474x|236x)\//)?.[1];
      return { originals: 1000, "1200x": 900, "736x": 800, "564x": 700, "474x": 600, "236x": 500 }[size] || 100;
    };
    return urls.sort((a, b) => score(b) - score(a))[0] || "";
  }

  function capture(map) {
    for (const link of document.querySelectorAll('a[href*="/pin/"]')) {
      const id = link.getAttribute("href")?.match(/\/pin\/(\d+)/)?.[1];
      if (!id) continue;
      const card = link.closest('[data-test-id="pin"]') || link.parentElement?.parentElement || link;
      const candidates = mediaCandidates(card);
      const best = bestCandidate(candidates);
      if (!best) continue;
      const existing = map.get(id);
      const title = (card.querySelector("img")?.getAttribute("alt") || "").trim().slice(0, 160);
      if (!existing) map.set(id, { id, title, source: best, pin: `https://www.pinterest.com/pin/${id}/` });
      else if (bestCandidate([best, existing.source]) === best) existing.source = best;
    }
  }

  function originalCandidate(source) {
    try {
      const url = new URL(source);
      if (!/\/(236x|474x|564x|736x|1200x)\//.test(url.pathname)) return source;
      url.pathname = url.pathname.replace(/\/(236x|474x|564x|736x|1200x)\//, "/originals/");
      return url.href;
    } catch { return source; }
  }

  function extension(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.match(/\.(jpe?g|png|webp|gif|mp4)$/)?.[1]?.replace("jpeg", "jpg") || "jpg";
  }

  async function run(expected) {
    const startUrl = location.href;
    const slug = boardSlug();
    const map = new Map();
    const state = { running: true, phase: "Buscando pines", found: 0, saved: 0, failed: 0, scrolls: 0, detail: "" };
    await publish(state);
    let scanTimer = null;
    const observer = new MutationObserver(() => {
      if (scanTimer) return;
      scanTimer = setTimeout(() => { scanTimer = null; capture(map); }, 80);
    });
    observer.observe(document.body, { subtree: true, childList: true });
    let idleAtBottom = 0;
    let previousCount = 0;
    let scanLimitReached = true;
    try {
      for (let step = 0; step < 4000 && !cancelled; step++) {
        if (location.href !== startUrl) throw new Error("Cambió la página del tablero durante el recorrido.");
        capture(map);
        const doc = document.scrollingElement || document.documentElement;
        const beforeY = window.scrollY;
        window.scrollBy(0, Math.max(350, Math.floor(innerHeight * 0.8)));
        await sleep(700);
        capture(map);
        state.scrolls = step + 1;
        state.found = map.size;
        if (step % 3 === 0 || map.size !== previousCount) await publish({ ...state });
        const atBottom = window.scrollY + innerHeight >= doc.scrollHeight - 10;
        idleAtBottom = atBottom && map.size === previousCount && window.scrollY === beforeY ? idleAtBottom + 1 : 0;
        previousCount = map.size;
        if (idleAtBottom >= 8) { scanLimitReached = false; break; }
        if (map.size >= 10000) throw new Error("Se alcanzó el límite de seguridad de 10 000 pines.");
      }
    } finally {
      observer.disconnect();
      if (scanTimer) clearTimeout(scanTimer);
    }
    capture(map);
    state.found = map.size;
    if (cancelled) {
      await publish({ ...state, running: false, phase: "Detenido", detail: "Se detuvo durante el recorrido." });
      return;
    }
    if (!map.size) throw new Error("No se encontraron pines con imagen. Abre la vista de pines del tablero.");
    const rows = [];
    state.phase = "Descargando archivos";
    await publish({ ...state });
    let index = 0;
    for (const pin of map.values()) {
      if (cancelled) break;
      index++;
      const preferred = originalCandidate(pin.source);
      const choices = [...new Set([preferred, pin.source])];
      let error = "";
      let filename = "";
      for (const url of choices) {
        filename = `Pinterest_Tablero_Completo/${slug}/${String(index).padStart(4, "0")}_${pin.id}.${extension(url)}`;
        const result = await download(url, filename);
        if (result?.ok) { error = ""; break; }
        error = result?.error || "Descarga fallida";
      }
      if (error) state.failed++;
      else state.saved++;
      rows.push({ ...pin, filename: error ? "" : filename, status: error ? "fallido" : "guardado", error });
      state.detail = `${index} de ${map.size} procesados`;
      await publish({ ...state });
      await sleep(180);
    }
    const report = {
      boardUrl: startUrl,
      generatedAt: new Date().toISOString(),
      expected: expected || null,
      discovered: map.size,
      saved: state.saved,
      failed: state.failed,
      cancelled,
      pins: rows
    };
    const reportName = `Pinterest_Tablero_Completo/${slug}/informe.json`;
    const reportResult = await chrome.runtime.sendMessage({ type: "report", filename: reportName, body: JSON.stringify(report, null, 2) }).catch(e => ({ ok: false, error: String(e) }));
    const short = expected && map.size < expected ? `Se hallaron ${map.size} de ${expected} esperados. Revisa si hay secciones o pines que Pinterest no cargó.` : scanLimitReached ? "El recorrido alcanzó su límite de pasos; podría faltar contenido." : "";
    const reportError = reportResult?.ok ? "" : ` No se guardó el informe: ${reportResult?.error || "error"}.`;
    state.running = false;
    state.phase = cancelled ? "Detenido" : state.failed ? "Terminado con fallos" : short ? "Recorrido incompleto" : "Terminado";
    state.detail = `${short || `${state.saved} archivos guardados.`}${reportError}`;
    await publish({ ...state });
  }

  async function download(url, filename) {
    const started = await chrome.runtime.sendMessage({ type: "download", url, filename })
      .catch(e => ({ ok: false, error: String(e) }));
    if (!started?.ok) return started;
    for (let attempt = 0; attempt < 300; attempt++) {
      await sleep(1000);
      const result = await chrome.runtime.sendMessage({ type: "downloadStatus", id: started.id })
        .catch(e => ({ ok: false, error: String(e) }));
      if (!result?.ok) return result;
      if (result.state === "complete") return { ok: true };
      if (result.state === "interrupted") return { ok: false, error: result.error || "Descarga interrumpida" };
    }
    return { ok: false, error: "La descarga superó cinco minutos; comprueba Descargas de Chrome." };
  }
})();
