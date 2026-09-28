function render(s, extra) {
  const ago = s.lastPoll ? Math.round((Date.now() - s.lastPoll) / 1000) + "s" : "nunca";
  document.getElementById("status").textContent =
    (extra ? extra + "\n" : "") +
    "Último poll: " +
    ago +
    "\nJob: " +
    (s.lastJob || "—") +
    " " +
    (s.lastKind || "") +
    "\nHecho: " +
    (s.lastDone || "—") +
    (s.liveUrl ? "\nURL: " + s.liveUrl : "") +
    (s.lastError ? "\nError: " + s.lastError : "");
}

async function load() {
  const s = await chrome.storage.local.get([
    "bridgeUrl",
    "token",
    "lastPoll",
    "lastJob",
    "lastDone",
    "lastError",
    "lastKind",
    "liveUrl",
  ]);
  document.getElementById("url").value = s.bridgeUrl || "http://127.0.0.1:8787";
  document.getElementById("token").value = s.token || "";
  render(s);
}

async function persist() {
  const origins = [
    "http://127.0.0.1/*",
    "http://localhost/*",
    "http://127.0.0.1:8787/*",
    "http://localhost:8787/*",
  ];
  try {
    await chrome.permissions.request({ origins });
  } catch {
    /* older chrome */
  }
  await chrome.storage.local.set({
    bridgeUrl: document.getElementById("url").value.trim(),
    token: document.getElementById("token").value.trim(),
  });
}

async function ping() {
  document.getElementById("status").textContent = "Probando 127.0.0.1:8787…";
  const reply = await chrome.runtime.sendMessage({ type: "OR_PING" });
  const s = await chrome.storage.local.get([
    "lastPoll",
    "lastJob",
    "lastDone",
    "lastError",
    "lastKind",
    "liveUrl",
  ]);
  if (reply && reply.ok) {
    render(s, "Puente OK · motor " + ((reply.data && reply.data.engine) || "?"));
    return;
  }
  render(
    s,
    "No hay puente en este PC. OpenReels Puente → Extensión Flow → Conectar. Luego Recargar en chrome://extensions.",
  );
}

document.getElementById("save").addEventListener("click", async () => {
  await persist();
  await ping();
});
document.getElementById("ping").addEventListener("click", ping);
load();
