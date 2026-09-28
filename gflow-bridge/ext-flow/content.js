(() => {
  if (window.__openreelsFlow) return;
  window.__openreelsFlow = true;

  const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

  function visible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const box = el.getBoundingClientRect();
    return box.width > 2 && box.height > 2;
  }

  function setNative(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function promptEl() {
    const nodes = [
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll('[contenteditable="true"]'),
      ...document.querySelectorAll('[role="textbox"]'),
    ];
    return nodes.find((n) => visible(n) && n.offsetHeight > 24) || null;
  }

  function clickable(labelNeedles) {
    const needles = labelNeedles.map((s) => s.toLowerCase());
    const nodes = [...document.querySelectorAll("button, [role='button'], mat-chip, span, div")];
    return (
      nodes.find((el) => {
        if (!visible(el)) return false;
        const t = (el.innerText || el.textContent || "").trim().toLowerCase();
        return t.length > 0 && t.length < 80 && needles.some((n) => t === n || t.includes(n));
      }) || null
    );
  }

  function generateBtn() {
    const byText = clickable(["generar", "generate", "create"]);
    if (byText) return byText;
    const icons = [...document.querySelectorAll("button, [role='button']")].filter(visible);
    return (
      icons.find((el) => /arrow_forward|send|create/i.test(el.innerText || el.textContent || "")) ||
      null
    );
  }

  function fileInput() {
    return document.querySelector('input[type="file"]');
  }

  function mediaUrls() {
    const out = [];
    document.querySelectorAll("img, video, source, a").forEach((el) => {
      const u = el.currentSrc || el.src || el.href || "";
      if (!u) return;
      if (/avatar|icon|favicon|sprite|logo/i.test(u)) return;
      if (/flow-content|googleusercontent|blob:|lh3\.google/i.test(u)) out.push(u);
    });
    return [...new Set(out)];
  }

  function clickRefreshIfUnusual() {
    const toast = [...document.querySelectorAll("div, span, button")].find((el) =>
      /actividad inusual|unusual activity|no se te cobr/i.test(el.innerText || ""),
    );
    if (!toast) return false;
    const refresh = [...document.querySelectorAll("button, [role='button'], span, i")].find((el) => {
      const t = (el.innerText || el.textContent || "").trim().toLowerCase();
      return visible(el) && (t === "refresh" || t === "replay" || t === "autorenew");
    });
    if (refresh) {
      refresh.click();
      return true;
    }
    return false;
  }

  async function injectPrompt(text) {
    let el = null;
    for (let i = 0; i < 40; i++) {
      el = promptEl();
      if (el) break;
      await wait(0.5);
    }
    if (!el) throw new Error("no encuentro el cuadro de prompt en Flow");
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") setNative(el, text);
    else {
      el.textContent = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await wait(0.4);
  }

  function fileFromB64(b64, name, mime) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: mime });
  }

  async function injectFile(b64, name) {
    if (!b64 || b64.length < 80) return;
    const input = fileInput();
    if (!input) throw new Error("Flow no muestra input de archivo (i2i / i2v)");
    const dt = new DataTransfer();
    dt.items.add(fileFromB64(b64.replace(/^data:[^;]+;base64,/, ""), name, "image/png"));
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files").set;
      setter.call(input, dt.files);
    } catch {
      input.files = dt.files;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(1.5);
  }

  async function clickNeedles(needles) {
    const el = clickable(needles);
    if (!el) return false;
    el.click();
    await wait(0.4);
    return true;
  }

  const MODEL_CLICK = {
    "nano-pro": ["nano banana pro", "gem_pix", "pro"],
    nano2: ["nano banana 2", "nano banana", "narwhal"],
    "omni-flash": ["omni 1.1", "omni"],
    "veo-lite": ["veo 3.1 - lite", "veo 3.1 lite", "lite"],
    "veo-lite-lp": ["lower priority", "low priority"],
    "veo-fast": ["fast"],
    "veo-quality": ["quality"],
  };

  async function pickModel(model) {
    const needles = MODEL_CLICK[String(model || "").toLowerCase()];
    if (!needles) return;
    await clickNeedles(needles);
  }

  async function pickAspect(aspect) {
    if (aspect === "9:16") await clickNeedles(["9:16", "portrait", "vertical"]);
    else await clickNeedles(["16:9", "landscape", "horizontal"]);
  }

  async function pickDuration(seconds) {
    if (!seconds) return;
    await clickNeedles([String(seconds) + "s", String(seconds) + " s"]);
  }

  async function clickGenerate() {
    let btn = null;
    for (let i = 0; i < 25; i++) {
      btn = generateBtn();
      if (btn && !btn.disabled) break;
      await wait(0.5);
    }
    if (!btn) throw new Error("no encuentro Generar en Flow");
    btn.click();
    await wait(1);
  }

  async function waitMedia(kind, before, timeoutS) {
    const start = Date.now();
    while ((Date.now() - start) / 1000 < timeoutS) {
      clickRefreshIfUnusual();
      const now = mediaUrls();
      const fresh = now.filter((u) => !before.includes(u));
      const hit = fresh.find((u) => (kind === "video" ? /video|\.mp4|blob:/i.test(u) : true));
      if (hit) return hit;
      const videos = [...document.querySelectorAll("video")].filter(visible);
      if (kind === "video" && videos.length) {
        const src = videos[videos.length - 1].currentSrc || videos[videos.length - 1].src;
        if (src && !before.includes(src)) return src;
      }
      await wait(2);
    }
    throw new Error("Flow no entregó el media a tiempo");
  }

  async function toB64(url) {
    const res = await fetch(url);
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
    const before = mediaUrls();
    await pickModel(job.model);
    await pickAspect(job.aspect);
    await pickDuration(job.durationSeconds);
    if (job.kind === "image" && job.referencePng) await injectFile(job.referencePng, "or-ref.png");
    if (job.kind === "video" && job.imagePng) await injectFile(job.imagePng, "or-i2v.png");
    await injectPrompt(job.prompt || "");
    await wait(0.8);
    await clickGenerate();
    const url = await waitMedia(job.kind, before, job.kind === "video" ? 900 : 240);
    try {
      const b64 = await toB64(url);
      if (job.kind === "video") return { ok: true, mp4: b64 };
      return { ok: true, png: b64 };
    } catch {
      return { ok: true, url };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "OR_FLOW_JOB") return;
    runJob(msg.job)
      .then((out) => sendResponse(out))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  });
})();
