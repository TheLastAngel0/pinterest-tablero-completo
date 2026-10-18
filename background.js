chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "getTabId") {
    reply({ tabId: sender.tab?.id || null });
    return;
  }
  if (message?.type === "downloadStatus") {
    if (!Number.isInteger(message.id) || message.id < 0) {
      reply({ ok: false, error: "Identificador inválido" });
      return;
    }
    chrome.downloads.search({ id: message.id })
      .then(items => {
        const item = items[0];
        reply(item ? { ok: true, state: item.state, error: item.error || "" } : { ok: false, error: "Descarga no encontrada" });
      })
      .catch(error => reply({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === "report") {
    if (typeof message.body !== "string" || message.body.length > 3_000_000 || !validFilename(message.filename)) {
      reply({ ok: false, error: "Informe inválido" });
      return;
    }
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(message.body)}`;
    chrome.downloads.download({ url, filename: message.filename, conflictAction: "uniquify", saveAs: false })
      .then(() => reply({ ok: true }))
      .catch(error => reply({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type !== "download") return;
  const { url, filename } = message;
  if (!validMediaUrl(url) || !validFilename(filename)) {
    reply({ ok: false, error: "URL o nombre de archivo no permitido" });
    return;
  }
  chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false })
    .then(id => reply({ ok: true, id }))
    .catch(error => reply({ ok: false, error: String(error?.message || error) }));
  return true;
});

function validMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "i.pinimg.com" || url.hostname.endsWith(".pinimg.com"));
  } catch { return false; }
}

function validFilename(value) {
  return typeof value === "string" && value.length < 240 &&
    /^Pinterest_Tablero_Completo\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(value) &&
    !value.includes("..");
}
