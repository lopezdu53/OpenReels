const DEFAULTS = ["http://127.0.0.1:8787", "http://localhost:8787"];

async function settings() {
  const stored = await chrome.storage.local.get(["bridgeUrl", "token"]);
  return {
    bridgeUrl: String(stored.bridgeUrl || DEFAULTS[0]).replace(/\/$/, ""),
    token: String(stored.token || ""),
  };
}

function explainFetch(err, url) {
  const raw = String((err && err.message) || err || "Failed to fetch");
  if (/abort/i.test(raw)) return "timeout al hablar con el puente";
  return (
    "Chrome no alcanza " +
    url +
    " (" +
    raw +
    "). Abre OpenReels Puente 1.8.1, motor Extensión Flow, pulsa Conectar " +
    "y espera «escuchando 0.0.0.0:8787». Luego recarga esta extensión."
  );
}

async function postJson(base, path, body, token, waitMs) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), waitMs || 35000);
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: text.slice(0, 200) };
    }
  } finally {
    clearTimeout(t);
  }
}

async function getJson(base, path, token) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(base + path, { method: "GET", headers, cache: "no-store" });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 200) };
  }
}

async function bases() {
  const { bridgeUrl } = await settings();
  const out = [];
  for (const u of [bridgeUrl, ...DEFAULTS]) {
    const n = String(u || "").replace(/\/$/, "");
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

async function api(path, body, waitMs) {
  const { token } = await settings();
  const urls = await bases();
  let lastErr = null;
  for (const base of urls) {
    try {
      const data = await postJson(base, path, body, token, waitMs);
      await chrome.storage.local.set({ liveUrl: base });
      return data;
    } catch (err) {
      lastErr = err;
      await chrome.storage.local.set({ lastError: explainFetch(err, base) });
    }
  }
  throw lastErr || new Error("Failed to fetch");
}

async function ping() {
  const { token } = await settings();
  const urls = await bases();
  let lastErr = null;
  for (const base of urls) {
    try {
      const data = await getJson(base, "/v1/ext/status", token);
      if (data && data.ok) {
        await chrome.storage.local.set({
          liveUrl: base,
          lastPoll: Date.now(),
          lastError: "",
        });
        return data;
      }
      lastErr = new Error(data && data.error ? data.error : "status no ok");
    } catch (err) {
      lastErr = err;
      await chrome.storage.local.set({ lastError: explainFetch(err, base) });
    }
  }
  throw lastErr || new Error("Failed to fetch");
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text: text || "" });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

async function ensureFlowTab(job) {
  const project = String((job && job.project) || "").trim();
  const dest = project
    ? "https://flow.google.com/project/" + encodeURIComponent(project)
    : "https://flow.google.com/";
  const tabs = await chrome.tabs.query({
    url: ["https://flow.google.com/*", "https://*.flow.google.com/*", "https://labs.google/*"],
  });
  const live = tabs.find((t) => t.id && !t.discarded);
  if (live?.id) {
    const url = String(live.url || "");
    if (project && !url.includes(project)) {
      await chrome.tabs.update(live.id, { url: dest, active: true });
      await new Promise((r) => setTimeout(r, 5000));
    } else {
      try {
        await chrome.tabs.update(live.id, { active: true });
      } catch {
        /* ignore */
      }
    }
    return live.id;
  }
  const created = await chrome.tabs.create({ url: dest, active: true });
  await new Promise((r) => setTimeout(r, 5000));
  return created.id;
}

function sendJob(tabId, job) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "OR_FLOW_JOB", job }, (reply) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(reply || { ok: false, error: "sin respuesta de Flow" });
    });
  });
}

async function harvestUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("no pude bajar el media " + res.status);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function runJob(job) {
  const tabId = await ensureFlowTab(job);
  let reply;
  try {
    reply = await sendJob(tabId, job);
  } catch (err) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await new Promise((r) => setTimeout(r, 400));
    reply = await sendJob(tabId, job);
  }
  if (reply?.url && !reply.png && !reply.mp4) {
    const b64 = await harvestUrl(reply.url);
    if (job.kind === "video") reply.mp4 = b64;
    else reply.png = b64;
  }
  return reply;
}

let looping = false;

async function loop() {
  if (looping) return;
  looping = true;
  await setBadge("…", "#8e8e93");
  try {
    while (true) {
      try {
        const data = await api("/v1/ext/poll", { wait: 20 }, 28000);
        const job = data && data.job;
        if (!job || !job.id) {
          await setBadge("ok", "#30d158");
          await chrome.storage.local.set({ lastPoll: Date.now(), lastError: "" });
          continue;
        }
        await setBadge("GO", "#d8ff00");
        await chrome.storage.local.set({ lastJob: job.id, lastKind: job.kind, lastError: "" });
        let result;
        try {
          result = await runJob(job);
        } catch (err) {
          result = { ok: false, error: String(err && err.message ? err.message : err) };
        }
        await api(
          "/v1/ext/result",
          {
            id: job.id,
            ok: Boolean(result && result.ok !== false && (result.png || result.mp4) && !result.error),
            png: result?.png || "",
            mp4: result?.mp4 || "",
            error: result?.error || "",
          },
          120000,
        );
        await chrome.storage.local.set({
          lastDone: job.id,
          lastError: result?.error || "",
        });
        await setBadge(result?.error ? "err" : "ok", result?.error ? "#ff453a" : "#30d158");
      } catch (err) {
        await setBadge("off", "#ff453a");
        const { liveUrl, bridgeUrl } = await chrome.storage.local.get(["liveUrl", "bridgeUrl"]);
        await chrome.storage.local.set({
          lastError: explainFetch(err, liveUrl || bridgeUrl || DEFAULTS[0]),
        });
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  } finally {
    looping = false;
  }
}

chrome.runtime.onInstalled.addListener(() => loop());
chrome.runtime.onStartup.addListener(() => loop());
async function pressEnterOnTab(tabId) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const key = {
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: "\r",
      unmodifiedText: "\r",
    };
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", ...key });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
  } finally {
    try {
      await chrome.debugger.detach(target);
    } catch {
      /* ignore */
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "OR_PRESS_ENTER") {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "sin pestaña Flow" });
      return;
    }
    pressEnterOnTab(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  }
  if (msg.type !== "OR_PING") return;
  ping()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
  loop();
  return true;
});
try {
  chrome.alarms.create("or-poll", { periodInMinutes: 0.5 });
} catch {
  /* ignore */
}
chrome.alarms.onAlarm.addListener(() => loop());
loop();
