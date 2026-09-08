import { spawn } from "node:child_process";

export function gflowBin(): string {
  return process.env["GFLOW_CLI_BIN"] || "gflow";
}

export function gflowProfile(): string | undefined {
  return process.env["GFLOW_CLI_PROFILE"] || undefined;
}

export function gflowProject(): string | undefined {
  return process.env["GFLOW_CLI_PROJECT"] || undefined;
}

export class GflowCliError extends Error {
  readonly exitCode: number;
  readonly retryable: boolean;

  constructor(message: string, exitCode = 1, retryable = false) {
    super(message);
    this.name = "GflowCliError";
    this.exitCode = exitCode;
    this.retryable = retryable;
  }
}

export interface GflowRunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runGflow(args: string[], timeoutMs = 240_000): Promise<GflowRunResult> {
  const bin = gflowBin();
  const extra: string[] = [];
  const profile = gflowProfile();
  const project = gflowProject();
  if (profile && !args.includes("--profile")) extra.push("--profile", profile);
  if (project && !args.includes("--project")) extra.push("--project", project);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args, ...extra], {
      env: { ...process.env, GFLOW_CLI_LOG_FORMAT: "json" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new GflowCliError(`gflow timeout after ${Math.round(timeoutMs / 1000)}s`, 1, true));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new GflowCliError(
          `No se encontró gflow-cli (${bin}). Instálalo en el worker y autentica con gflow auth login --browser chrome. ${err.message}`,
          127,
          false,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export function parseGflowJson(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new GflowCliError(`gflow no devolvió JSON: ${stdout.slice(0, 240) || "(vacío)"}`);
  }
  return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
}

export async function runGflowJson(args: string[], timeoutMs?: number): Promise<Record<string, unknown>> {
  const withJson = args.includes("--json") ? args : [...args, "--json"];
  const result = await runGflow(withJson, timeoutMs);
  let payload: Record<string, unknown> | null = null;
  try {
    payload = parseGflowJson(result.stdout);
  } catch {
    /* fall through */
  }
  if (payload?.["status"] === "fail") {
    const err = (payload["error"] ?? {}) as Record<string, unknown>;
    throw new GflowCliError(
      String(err["detail"] ?? err["title"] ?? payload["error"] ?? "gflow falló"),
      Number(err["exit_code"] ?? result.code) || 1,
      err["retryable"] === true,
    );
  }
  if (result.code !== 0) {
    throw new GflowCliError(
        payload
        ? String(
            (payload["error"] as Record<string, unknown> | undefined)?.["detail"] ??
              result.stderr.slice(0, 240) ??
              `gflow exit ${result.code}`,
          )
        : result.stderr.slice(0, 280) || result.stdout.slice(0, 280) || `gflow exit ${result.code}`,
      result.code,
      result.code === 11 || result.code === 37 ? false : true,
    );
  }
  if (!payload) throw new GflowCliError(`gflow no devolvió JSON: ${result.stdout.slice(0, 240)}`);
  return payload;
}

export async function gflowDoctor(): Promise<{ ok: boolean; detail: string }> {
  try {
    const payload = await runGflowJson(["doctor"], 30_000);
    const status = String(payload["overall_status"] ?? "unknown");
    return { ok: status === "ok" || status === "pass", detail: status };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
