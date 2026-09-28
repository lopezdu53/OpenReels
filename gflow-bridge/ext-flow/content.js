(() => {
  if (window.__openreelsFlow) return;
  window.__openreelsFlow = true;

  const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    const box = el.getBoundingClientRect();
    return box.width > 4 && box.height > 8;
  }

  function deepAll(root) {
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.shadowRoot) walk(node.shadowRoot);
      const kids = node.querySelectorAll ? node.querySelectorAll("*") : [];
      for (const el of kids) {
        out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root || document);
    try {
      for (const frame of document.querySelectorAll("iframe")) {
        try {
          if (frame.contentDocument) walk(frame.contentDocument);
        } catch {
          /* cross-origin */
        }
      }
    } catch {
      /* ignore */
    }
    return out;
  }

  function setNative(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function promptScore(el) {
    const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("placeholder") || ""} ${el.getAttribute("data-placeholder") || ""}`.toLowerCase();
    const box = el.getBoundingClientRect();
    let n = box.width * box.height;
    if (/prompt|describe|instrucci|imagen|image|video|idea/.test(label)) n += 40000;
    if (el.tagName === "TEXTAREA") n += 20000;
    if (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "plaintext-only") n += 12000;
    if (box.top > window.innerHeight * 0.45) n += 8000;
    if (box.height < 10 || box.width < 80) return 0;
    return n;
  }

  function promptEl() {
    const cands = [];
    for (const n of deepAll()) {
      const ce = (n.getAttribute("contenteditable") || "").toLowerCase();
      const role = (n.getAttribute("role") || "").toLowerCase();
      if (
        n.tagName === "TEXTAREA" ||
        n.tagName === "INPUT" ||
        ce === "true" ||
        ce === "plaintext-only" ||
        role === "textbox" ||
        role === "searchbox"
      ) {
        if (visible(n) && promptScore(n) > 0) cands.push(n);
      }
    }
    cands.sort((a, b) => promptScore(b) - promptScore(a));
    return cands[0] || null;
  }

  function textOf(el) {
    return (el.getAttribute("aria-label") || el.innerText || el.textContent || "").trim();
  }

  function clickable(labelNeedles, opts) {
    const exact = Boolean(opts && opts.exact);
    const maxLen = (opts && opts.maxLen) || 48;
    const needles = labelNeedles.map((s) => s.toLowerCase());
    const nodes = deepAll().filter((el) => {
      const tag = el.tagName;
      return (
        tag === "BUTTON" ||
        tag === "A" ||
        el.getAttribute("role") === "button" ||
        el.getAttribute("role") === "tab" ||
        tag === "SPAN" ||
        tag === "DIV"
      );
    });
    return (
      nodes.find((el) => {
        if (!visible(el)) return false;
        const t = textOf(el).toLowerCase().replace(/\s+/g, " ");
        if (!t || t.length > maxLen) return false;
        return needles.some((n) => (exact ? t === n : t === n || t.includes(n)));
      }) || null
    );
  }

  function composerBar() {
    const p = promptEl();
    let best = p;
    let n = p;
    for (let i = 0; i < 16 && n; i++) {
      const b = n.getBoundingClientRect();
      if (b.width > 300 && b.height >= 32 && b.height <= 260 && b.top > window.innerHeight * 0.35) {
        best = n;
      }
      n = n.parentElement;
    }
    if (best) return best;
    let score = 0;
    for (const el of deepAll()) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.top < window.innerHeight * 0.5 || b.width < 360 || b.height < 36 || b.height > 240) continue;
      const s = b.width / Math.max(b.height, 1);
      if (s > score) {
        score = s;
        best = el;
      }
    }
    return best;
  }

  function firePointer(el, x, y) {
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try {
        if (type.startsWith("pointer")) el.dispatchEvent(new PointerEvent(type, opts));
        else el.dispatchEvent(new MouseEvent(type, opts));
      } catch {
        /* ignore */
      }
    }
    try {
      el.click();
    } catch {
      /* ignore */
    }
  }

  function generateBtn() {
    const bar = composerBar();
    const pool = bar ? deepAll(bar) : deepAll();
    const nodes = pool.filter((el) => {
      if (!visible(el)) return false;
      const tag = el.tagName;
      const role = el.getAttribute("role") || "";
      return tag === "BUTTON" || tag === "A" || role === "button" || tag === "MAT-ICON-BUTTON";
    });
    for (const el of nodes) {
      const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase();
      const t = textOf(el).toLowerCase().replace(/\s+/g, " ").trim();
      if (/cerrar|close|dismiss|cancel/.test(label) || t === "×" || t === "x") continue;
      if (/generar|generate|create|submit|enviar|arrow_forward|send/.test(label)) return el;
      if (/^(generar|generate|create|arrow_forward|send)$/.test(t)) return el;
    }
    const svgs = pool.filter((el) => el.tagName === "SVG" && visible(el));
    for (const svg of svgs) {
      const box = svg.getBoundingClientRect();
      if (box.width > 48 || box.height > 48) continue;
      let host = svg.parentElement;
      for (let i = 0; i < 5 && host; i++) {
        if (host.tagName === "BUTTON" || host.getAttribute("role") === "button") return host;
        host = host.parentElement;
      }
    }
    if (!bar) return null;
    const br = bar.getBoundingClientRect();
    const right = pool.filter((el) => {
      const b = el.getBoundingClientRect();
      if (b.left < br.right - 88 || b.right > br.right + 8) return false;
      if (b.width < 18 || b.height < 18 || b.width > 72 || b.height > 72) return false;
      const t = textOf(el).replace(/\s+/g, "");
      return t.length < 10 && !/agente|agent|nano|x1|\+/i.test(t);
    });
    right.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
    return right[0] || null;
  }

  function clickArrowByPoint() {
    const bar = composerBar();
    if (!bar) return false;
    const b = bar.getBoundingClientRect();
    const spots = [
      [b.right - 24, b.top + b.height / 2],
      [b.right - 36, b.top + b.height / 2],
      [b.right - 20, b.bottom - 24],
      [b.right - 48, b.top + b.height / 2],
    ];
    for (const [x, y] of spots) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      firePointer(el, x, y);
      return true;
    }
    return false;
  }

  function fileInput() {
    return deepAll().find((el) => el.tagName === "INPUT" && el.type === "file") || null;
  }

  function mediaUrls() {
    const out = [];
    deepAll().forEach((el) => {
      const u = el.currentSrc || el.src || el.href || "";
      if (!u) return;
      if (/avatar|icon|favicon|sprite|logo/i.test(u)) return;
      if (/flow-content|googleusercontent|blob:|lh3\.google/i.test(u)) out.push(u);
    });
    return [...new Set(out)];
  }

  function clickRefreshIfUnusual() {
    const toast = deepAll().find((el) => /actividad inusual|unusual activity|no se te cobr/i.test(textOf(el)));
    if (!toast) return false;
    const refresh = deepAll().find((el) => {
      const t = textOf(el).toLowerCase();
      return visible(el) && (t === "refresh" || t === "replay" || t === "autorenew");
    });
    if (refresh) {
      refresh.click();
      return true;
    }
    return false;
  }

  async function typePrompt(el, text) {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    el.focus();
    try {
      document.execCommand("selectAll", false, undefined);
      document.execCommand("delete", false, undefined);
    } catch {
      /* ignore */
    }
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") setNative(el, text);
    else {
      try {
        document.execCommand("insertText", false, text);
      } catch {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    }
    await wait(0.3);
  }

  async function revealComposer() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(0.3);
    await clickNeedles(["new image", "nueva imagen", "text to image", "texto a imagen", "imagen", "image"], {
      exact: false,
      maxLen: 32,
    });
    const agentOn = clickable(["agent on", "agente: on", "agente activado"], { maxLen: 40 });
    if (agentOn) {
      agentOn.click();
      await wait(0.4);
    }
  }

  async function injectPrompt(text) {
    let el = null;
    for (let i = 0; i < 24; i++) {
      if (i === 2 || i === 8) await revealComposer();
      el = promptEl();
      if (el) break;
      await wait(0.5);
    }
    if (!el) {
      throw new Error(
        "no encuentro el cuadro de prompt. Entra al proyecto de Flow (no la home), Agent OFF, y deja visible el compositor de Imagen.",
      );
    }
    await typePrompt(el, text);
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

  async function clickNeedles(needles, opts) {
    const el = clickable(needles, opts);
    if (!el) return false;
    el.click();
    await wait(0.4);
    return true;
  }

  const MODEL_CLICK = {
    "nano-pro": ["nano banana pro", "banana pro"],
    nano2: ["nano banana 2", "nano banana"],
    "omni-flash": ["omni 1.1 flash", "omni 1.1"],
    "veo-lite": ["veo 3.1 - lite", "veo 3.1 lite"],
    "veo-lite-lp": ["lower priority", "low priority"],
    "veo-fast": ["veo 3.1 - fast", "veo 3.1 fast"],
    "veo-quality": ["veo 3.1 - quality", "veo 3.1 quality"],
  };

  async function pickModel(model) {
    const needles = MODEL_CLICK[String(model || "").toLowerCase()];
    if (!needles) return;
    await clickNeedles(needles, { maxLen: 40 });
  }

  async function pickAspect(aspect) {
    if (aspect === "9:16") await clickNeedles(["9:16"], { exact: true, maxLen: 12 });
    else await clickNeedles(["16:9"], { exact: true, maxLen: 12 });
  }

  async function pickDuration(seconds) {
    if (!seconds) return;
    await clickNeedles([String(seconds) + "s", String(seconds) + " s"], { maxLen: 8 });
  }

  function pressEnter(el) {
    if (el) el.focus();
    const target = el || document.activeElement || document.body;
    const base = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      charCode: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    };
    for (const type of ["keydown", "keypress", "keyup"]) {
      const ev = new KeyboardEvent(type, base);
      target.dispatchEvent(ev);
      if (target !== document) document.dispatchEvent(new KeyboardEvent(type, base));
    }
  }

  async function clickGenerate() {
    const prompt = promptEl();
    if (!prompt) throw new Error("el prompt está escrito, pero no lo tengo enfocado para pulsar Enter");
    prompt.focus();
    await wait(0.4);
    pressEnter(prompt);
    try {
      const reply = await chrome.runtime.sendMessage({ type: "OR_PRESS_ENTER" });
      if (reply && reply.error) console.warn("[OpenReels Flow] Enter:", reply.error);
    } catch (err) {
      console.warn("[OpenReels Flow] Enter CDP:", err);
    }
    await wait(0.6);
  }

  async function waitMedia(kind, before, timeoutS) {
    const start = Date.now();
    while ((Date.now() - start) / 1000 < timeoutS) {
      clickRefreshIfUnusual();
      const now = mediaUrls();
      const fresh = now.filter((u) => !before.includes(u));
      const hit = fresh.find((u) => (kind === "video" ? /video|\.mp4|blob:/i.test(u) : true));
      if (hit) return hit;
      const videos = deepAll().filter((el) => el.tagName === "VIDEO" && visible(el));
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
    await revealComposer();
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
