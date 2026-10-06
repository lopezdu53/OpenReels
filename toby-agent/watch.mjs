#!/usr/bin/env node
/**
 * Windows helper: watch Toby Flow Auto Download folder and POST files to OpenReels.
 *
 * Prefer a watch.env file (no cmd quoting fights):
 *
 *   OPENREELS_URL=https://contenido.alfonsolopezd.com
 *   TOBY_AGENT_TOKEN=pega-el-token
 *   TOBY_INBOX_DIR=C:\Users\Keep Walking\Downloads\tobyflow_output\toby
 *
 *   node watch.mjs
 *
 * Or in cmd, always quote:
 *
 *   set "OPENREELS_URL=https://tu-estudio"
 *   set "TOBY_AGENT_TOKEN=el-token"
 *   set "TOBY_INBOX_DIR=C:\Users\Keep Walking\Downloads\tobyflow_output\toby"
 *   node watch.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function applyEnvFile(text, env = process.env) {
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && (env[key] == null || env[key] === "")) env[key] = val;
  }
  return env;
}

function loadEnvFile() {
  for (const name of ["watch.env", ".env"]) {
    const p = path.join(here, name);
    if (!fs.existsSync(p)) continue;
    applyEnvFile(fs.readFileSync(p, "utf8"));
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) loadEnvFile();

const base = (process.env.OPENREELS_URL || "").replace(/\/$/, "");
const token = process.env.TOBY_AGENT_TOKEN || process.env.TOBY_MCP_TOKEN || "";
const dir = process.env.TOBY_INBOX_DIR || "";

if (isMain && (!base || !token || !dir)) {
  console.error("Need OPENREELS_URL, TOBY_AGENT_TOKEN, TOBY_INBOX_DIR");
  console.error("Create toby-agent/watch.env (copy watch.env.example) or use set \"VAR=value\"");
  process.exit(1);
}

const seen = new Set();

function kindOf(file) {
  const low = file.toLowerCase();
  if (low.endsWith(".mp4") || low.endsWith(".webm") || low.endsWith(".mov")) return "video";
  if (low.endsWith(".png") || low.endsWith(".jpg") || low.endsWith(".jpeg") || low.endsWith(".webp")) {
    return "image";
  }
  return null;
}

async function waitStable(file, tries = 8) {
  let last = -1;
  for (let i = 0; i < tries; i++) {
    const size = fs.statSync(file).size;
    if (size > 1000 && size === last) return size;
    last = size;
    await new Promise((r) => setTimeout(r, 750));
  }
  return fs.statSync(file).size;
}

async function upload(file) {
  const kind = kindOf(file);
  if (!kind || seen.has(file)) return;
  seen.add(file);
  const size = await waitStable(file);
  if (size < 1000) return;
  const bytes = fs.readFileSync(file).toString("base64");
  const res = await fetch(`${base}/api/v1/toby/inbox`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ok: true,
      kind,
      filename: path.basename(file),
      bytes,
    }),
  });
  const text = await res.text();
  console.log(new Date().toISOString(), path.basename(file), res.status, text.slice(0, 200));
}

function scan() {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
      void upload(full);
    } catch {
      /* ignore */
    }
  }
}

if (isMain) {
  console.log("Toby inbox →", base, "watching", dir);
  scan();
  setInterval(scan, 4000);
  if (fs.existsSync(dir)) fs.watch(dir, () => scan());
}
