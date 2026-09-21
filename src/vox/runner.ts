import { spawn } from "node:child_process";
import * as path from "node:path";
import { jobDir, voxRoot } from "./store.js";

export function runVoxScript(
  script: string,
  args: string[],
  opts: { apiKey: string; log?: (line: string) => void },
): Promise<void> {
  const scriptsDir = path.join(voxRoot(), "scripts");
  const scriptPath = path.join(scriptsDir, script);
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath, ...args], {
      cwd: scriptsDir,
      env: {
        ...process.env,
        ATLASCLOUD_API_KEY: opts.apiKey,
        PYTHONUNBUFFERED: "1",
        SSL_CERT_FILE: process.env["SSL_CERT_FILE"] || "/etc/ssl/certs/ca-certificates.crt",
        REQUESTS_CA_BUNDLE: process.env["REQUESTS_CA_BUNDLE"] || "/etc/ssl/certs/ca-certificates.crt",
      },
    });
    let stderr = "";
    child.stdout.on("data", (buf: Buffer) => {
      const line = buf.toString();
      opts.log?.(line.trimEnd());
    });
    child.stderr.on("data", (buf: Buffer) => {
      const line = buf.toString();
      stderr += line;
      opts.log?.(line.trimEnd());
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited ${code}${stderr ? `: ${stderr.slice(-400)}` : ""}`));
    });
  });
}

export async function runBakeoff(id: string, themes: string[], apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("style_bakeoff.py", [jobDir(id), themes.join(","), "0"], { apiKey, log });
}

export async function runKeyframes(id: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("keyframes.py", [jobDir(id)], { apiKey, log });
}

export async function runCrollKeyframes(id: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("croll_keyframes.py", [jobDir(id)], { apiKey, log });
}

export async function runClips(id: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("clips.py", [jobDir(id)], { apiKey, log });
}

export async function runArollClips(id: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("aroll_clips.py", [jobDir(id)], { apiKey, log });
}

export async function runAsrBeats(id: string, source: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("asr_beats.py", [jobDir(id), source], { apiKey, log });
}

export async function runAudio(id: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("audio.py", [jobDir(id)], { apiKey, log });
}

export async function runAssemble(id: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("assemble.py", [jobDir(id)], { apiKey, log });
}

export async function runArollAssemble(id: string, apiKey: string, log?: (l: string) => void): Promise<void> {
  await runVoxScript("aroll_assemble.py", [jobDir(id)], { apiKey, log });
}
