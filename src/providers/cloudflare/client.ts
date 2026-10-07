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

export function cloudflareRunUrl(model: string, accountId?: string): string {
  const id = cloudflareAccountId(accountId);
  if (!id) throw new Error("Falta CLOUDFLARE_ACCOUNT_ID");
  const encoded = model.startsWith("@") ? model : encodeURIComponent(model);
  return `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${encoded}`;
}

export function cloudflareOpenAiBase(accountId?: string): string {
  const id = cloudflareAccountId(accountId);
  if (!id) throw new Error("Falta CLOUDFLARE_ACCOUNT_ID");
  return `https://api.cloudflare.com/client/v4/accounts/${id}/ai/v1`;
}

export async function cloudflareRun(
  model: string,
  body: unknown,
  opts?: { token?: string; accountId?: string; timeoutMs?: number },
): Promise<{ json: unknown; buffer?: Buffer }> {
  const token = cloudflareApiToken(opts?.token);
  if (!token) throw new Error("Falta CLOUDFLARE_API_TOKEN (Workers AI → Use REST API)");
  const res = await fetch(cloudflareRunUrl(model, opts?.accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
