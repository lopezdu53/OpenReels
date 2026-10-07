import { TobyError } from "./errors.js";
import { tobyMcpToken, tobyMcpUrl } from "./catalog.js";

export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface JsonRpc {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

function parseSseOrJson(text: string): JsonRpc {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as JsonRpc;
  const blocks = trimmed.split(/\n\n+/);
  let last: JsonRpc | null = null;
  for (const block of blocks) {
    const dataLines = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!dataLines || dataLines === "[DONE]") continue;
    try {
      last = JSON.parse(dataLines) as JsonRpc;
    } catch {
      /* ignore */
    }
  }
  if (!last) throw new TobyError(`Toby MCP: respuesta no JSON (${text.slice(0, 240)})`);
  return last;
}

export async function tobyMcpRpc(
  method: string,
  params: Record<string, unknown> | undefined,
  session: { id?: string },
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<{ rpc: JsonRpc; sessionId?: string }> {
  const token = tobyMcpToken();
  if (!token) throw new TobyError("Falta TOBY_MCP_TOKEN (extensión Toby → Settings → AI / MCP)");
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    };
    if (session.id) headers["Mcp-Session-Id"] = session.id;
    const body: JsonRpc = { jsonrpc: "2.0", method };
    if (!method.startsWith("notifications/")) body.id = Date.now();
    if (params) body.params = params;
    const res = await fetch(tobyMcpUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const sessionId = res.headers.get("mcp-session-id") ?? session.id;
    const text = await res.text();
    if (!res.ok) {
      throw new TobyError(`Toby MCP HTTP ${res.status}: ${text.slice(0, 240)}`, res.status >= 500);
    }
    if (method.startsWith("notifications/") || !text.trim()) {
      return { rpc: {}, sessionId: sessionId ?? undefined };
    }
    const rpc = parseSseOrJson(text);
    if (rpc.error) {
      throw new TobyError(`Toby MCP ${method}: ${rpc.error.message ?? JSON.stringify(rpc.error)}`);
    }
    return { rpc, sessionId: sessionId ?? undefined };
  } catch (err) {
    if (err instanceof TobyError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new TobyError(`Toby MCP no responde (${tobyMcpUrl()}): ${msg}`, true);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    clearTimeout(timer);
  }
}

let sessionCache: { id?: string; at: number } = { at: 0 };

export async function tobyMcpSession(force = false): Promise<{ id?: string }> {
  if (!force && sessionCache.id && Date.now() - sessionCache.at < 10 * 60_000) {
    return { id: sessionCache.id };
  }
  const init = await tobyMcpRpc(
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "openreels", version: "1.0" },
    },
    {},
    12_000,
  );
  const session = { id: init.sessionId };
  await tobyMcpRpc("notifications/initialized", {}, session, 15_000).catch(() => undefined);
  sessionCache = { id: session.id, at: Date.now() };
  return session;
}

export async function tobyCallTool(
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
  onSession?: () => void,
): Promise<unknown> {
  const session = await tobyMcpSession();
  onSession?.();
  console.log(`[toby] MCP tools/call ${name}`);
  const { rpc } = await tobyMcpRpc(
    "tools/call",
    { name, arguments: args },
    session,
    timeoutMs,
    signal,
  );
  const result = rpc.result as { isError?: boolean; content?: unknown } | undefined;
  if (result && result.isError) {
    throw new TobyError(formatTobyToolError(name, result.content ?? result));
  }
  return rpc.result ?? rpc;
}

export function explainTobyUserError(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (
    /phiên đăng nhập|dang nhap mcp|no mcp (login )?session|not logged in|reconnect.*(account|tài khoản|tai khoan)|sidebar/i.test(
      text,
    ) &&
    /mcp|toby|flow/i.test(text)
  ) {
    return "Toby Flow no tiene sesión en Chrome. Abre la extensión Toby → sidebar de Flow, inicia sesión (Google) y pulsa conectar. El token de EasyPanel no basta: Flow tiene que estar logueado en el PC.";
  }
  return text;
}

export function formatTobyToolError(name: string, content: unknown): string {
  const blobs: string[] = [];
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && "text" in item) {
        blobs.push(String((item as { text?: string }).text ?? ""));
      }
    }
  } else if (typeof content === "string") {
    blobs.push(content);
  } else {
    blobs.push(JSON.stringify(content));
  }
  for (const blob of blobs) {
    try {
      const parsed = JSON.parse(blob) as { message?: string; error_code?: string };
      if (parsed.message) {
        return `Toby ${name}: ${explainTobyUserError(parsed.message)}`;
      }
    } catch {
      /* raw text */
    }
  }
  const raw = blobs.join(" ").trim() || JSON.stringify(content);
  return `Toby ${name}: ${explainTobyUserError(raw).slice(0, 280)}`;
}

export function resetTobyMcpSession(): void {
  sessionCache = { at: 0 };
}

export function resetTobyMcpSessionForTests(): void {
  resetTobyMcpSession();
}
