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
): Promise<{ rpc: JsonRpc; sessionId?: string }> {
  const token = tobyMcpToken();
  if (!token) throw new TobyError("Falta TOBY_MCP_TOKEN (extensión Toby → Settings → AI / MCP)");
  const ctrl = new AbortController();
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
    30_000,
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
): Promise<unknown> {
  const session = await tobyMcpSession();
  const { rpc } = await tobyMcpRpc(
    "tools/call",
    { name, arguments: args },
    session,
    timeoutMs,
  );
  const result = rpc.result as { isError?: boolean; content?: unknown } | undefined;
  if (result && result.isError) {
    throw new TobyError(`Toby ${name} error: ${JSON.stringify(result.content ?? result).slice(0, 400)}`);
  }
  return rpc.result ?? rpc;
}

export function resetTobyMcpSessionForTests(): void {
  sessionCache = { at: 0 };
}
