async function load() {
  const s = await chrome.storage.local.get(["bridgeUrl", "token", "lastPoll", "lastJob", "lastDone", "lastError", "lastKind"]);
  document.getElementById("url").value = s.bridgeUrl || "http://127.0.0.1:8787";
  document.getElementById("token").value = s.token || "";
  const ago = s.lastPoll ? Math.round((Date.now() - s.lastPoll) / 1000) + "s" : "nunca";
  document.getElementById("status").textContent =
    "Último poll: " +
    ago +
    "\nJob: " +
    (s.lastJob || "—") +
    " " +
    (s.lastKind || "") +
    "\nHecho: " +
    (s.lastDone || "—") +
    (s.lastError ? "\nError: " + s.lastError : "");
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    bridgeUrl: document.getElementById("url").value.trim(),
    token: document.getElementById("token").value.trim(),
  });
  document.getElementById("status").textContent = "Guardado. Deja Flow abierto.";
});

load();
