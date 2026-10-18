let tabId = null;
let statusKey = null;
const el = id => document.getElementById(id);

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/([^.]+\.)?pinterest\.[a-z.]+\//i.test(tab.url || "")) {
    el("page").textContent = "Abre primero tu tablero de Pinterest.";
    return;
  }
  tabId = tab.id;
  statusKey = `job:${tabId}`;
  el("page").textContent = tab.title || tab.url;
  el("start").disabled = false;
  el("start").addEventListener("click", start);
  el("cancel").addEventListener("click", () => chrome.tabs.sendMessage(tabId, { type: "cancel" }).catch(() => {}));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[statusKey]) render(changes[statusKey].newValue);
  });
  const saved = await chrome.storage.local.get(statusKey);
  render(saved[statusKey]);
}

async function start() {
  const expected = Number(el("expected").value) || 0;
  el("start").disabled = true;
  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: "start", expected });
    if (!result?.ok) throw new Error(result?.error || "No se pudo iniciar");
  } catch (error) {
    el("phase").textContent = "Actualiza la pestaña de Pinterest y vuelve a intentar.";
    el("detail").textContent = String(error?.message || error);
    el("start").disabled = false;
  }
}

function render(state) {
  if (!state) return;
  el("phase").textContent = state.phase || "Listo";
  el("found").textContent = `${state.found || 0} encontrados`;
  el("saved").textContent = `${state.saved || 0} guardados`;
  el("failed").textContent = `${state.failed || 0} fallidos`;
  el("scrolls").textContent = `${state.scrolls || 0} pasos`;
  el("detail").textContent = state.detail || "";
  el("cancel").hidden = !state.running;
  el("start").disabled = !!state.running;
}

initialize().catch(error => { el("phase").textContent = String(error); });
