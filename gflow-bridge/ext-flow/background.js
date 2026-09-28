const DEFAULT_BRIDGE = "http://127.0.0.1:8787";

async function settings() {
  const stored = await chrome.storage.local.get(["bridgeUrl", "token"]);
  return {
    bridgeUrl: String(stored.bridgeUrl || DEFAULT_BRIDGE).replace(/\/$/, ""),
    token: String(stored.token || ""),
  };
}

async function api(path, body, waitMs) {
  const { bridgeUrl, token } = await settings();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), waitMs || 35000);
  try {
    const res = await fetch(bridgeUrl + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
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

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text: text || "" });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

async function ensureFlowTab() {
  const tabs = await chrome.tabs.query({
    url: ["https://flow.google.com/*", "https://*.flow.google.com/*", "https://labs.google/*"],
  });
  const live = tabs.find((t) => t.id && !t.discarded);
  if (live?.id) {
    try {
      await chrome.tabs.update(live.id, { active: true });
    } catch {
      /* ignore */
    }
    return live.id;
  }
  const created = await chrome.tabs.create({ url: "https://flow.google.com/", active: true });
  await new Promise((r) => setTimeout(r, 4000));
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
  const tabId = await ensureFlowTab();
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
      await chrome.storage.local.set({
        lastError: String(err && err.message ? err.message : err),
      });
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

chrome.runtime.onInstalled.addListener(() => loop());
chrome.runtime.onStartup.addListener(() => loop());
loop();
