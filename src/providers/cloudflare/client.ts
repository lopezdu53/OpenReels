export function cloudflareAccountId(override?: string): string | undefined {
  return (
    override?.trim() ||
    process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim() ||
    undefined
  );
}

export function cloudflareApiToken(override?: string): string | undefined {
  return (
    override?.trim() ||
    process.env["CLOUDFLARE_API_TOKEN"]?.trim() ||
    process.env["CLOUDFLARE_API_KEY"]?.trim() ||
    undefined
  );
}

export function cloudflareReady(): boolean {
  return Boolean(cloudflareAccountId() && cloudflareApiToken());
}

/** Keep `@cf/org/model` slashes. Encoding `/` as `%2F` returns HTTP 400 "No route for that URI". */
export function encodeCloudflareModelPath(model: string): string {
  return model
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export function cloudflareRunUrl(model: string, accountId?: string): string {
  const id = cloudflareAccountId(accountId);
  if (!id) throw new Error("Falta CLOUDFLARE_ACCOUNT_ID");
  return `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${encodeCloudflareModelPath(model)}`;
}

export function cloudflareOpenAiBase(accountId?: string): string {
  const id = cloudflareAccountId(accountId);
  if (!id) throw new Error("Falta CLOUDFLARE_ACCOUNT_ID");
  return `https://api.cloudflare.com/client/v4/accounts/${id}/ai/v1`;
}

export async function cloudflareRun(
  model: string,
  body: unknown,
  opts?: { token?: string; accountId?: string; timeoutMs?: number; multipart?: boolean },
): Promise<{ json: unknown; buffer?: Buffer }> {
  const token = cloudflareApiToken(opts?.token);
  if (!token) throw new Error("Falta CLOUDFLARE_API_TOKEN (Workers AI → Use REST API)");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "cf-aig-gateway-id": process.env["CLOUDFLARE_AI_GATEWAY"]?.trim() || "default",
  };
  let payload: string | FormData;
  if (opts?.multipart) {
    const form = new FormData();
    const rec = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(rec)) {
      if (value == null) continue;
      if (Buffer.isBuffer(value)) {
        form.append(key, new Blob([new Uint8Array(value)]), `${key}.png`);
      } else if (value instanceof Blob) {
        form.append(key, value);
      } else {
        form.append(key, String(value));
      }
    }
    payload = form;
  } else {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(cloudflareRunUrl(model, opts?.accountId), {
    method: "POST",
    headers,
    body: payload,
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 120_000),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const json = (await res.json()) as {
      success?: boolean;
      result?: unknown;
      errors?: { message?: string }[];
      error?: { message?: string };
    };
    if (!res.ok || json.success === false) {
      const msg =
        json.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
        json.error?.message ||
        JSON.stringify(json).slice(0, 240);
      throw new Error(`Cloudflare Workers AI HTTP ${res.status}: ${msg}`);
    }
    return { json: json.result ?? json };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    throw new Error(`Cloudflare Workers AI HTTP ${res.status}: ${buffer.toString("utf8").slice(0, 240)}`);
  }
  return { json: null, buffer };
}
