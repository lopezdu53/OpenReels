import { createHash, randomBytes } from "node:crypto";
import type IORedis from "ioredis";
import type { SocialPlatform } from "./types.js";
import { publicBaseUrl } from "./types.js";

const PREFIX = "openreels:oauth:";
const memory = new Map<
  string,
  { userId: string; platform: SocialPlatform; verifier?: string; exp: number }
>();

export interface OauthState {
  userId: string;
  platform: SocialPlatform;
  verifier?: string;
}

export function redirectUri(platform: SocialPlatform): string {
  return `${publicBaseUrl()}/api/v1/oauth/${platform}/callback`;
}

export async function putOauthState(
  redis: IORedis | null,
  platform: SocialPlatform,
  userId: string,
  verifier?: string,
): Promise<string> {
  const state = randomBytes(16).toString("hex");
  const row = { userId, platform, verifier, exp: Date.now() + 10 * 60_000 };
  memory.set(state, row);
  if (redis) {
    try {
      await redis.set(`${PREFIX}${state}`, JSON.stringify(row), "EX", 600);
    } catch {
      /* memory */
    }
  }
  return state;
}

export async function takeOauthState(
  redis: IORedis | null,
  state: string,
): Promise<OauthState | null> {
  const raw = redis ? await redis.get(`${PREFIX}${state}`).catch(() => null) : null;
  if (redis && raw) await redis.del(`${PREFIX}${state}`).catch(() => {});
  const row = raw ? (JSON.parse(raw) as OauthState & { exp?: number }) : memory.get(state);
  memory.delete(state);
  if (!row) return null;
  if ("exp" in row && row.exp && row.exp < Date.now()) return null;
  return { userId: row.userId, platform: row.platform, verifier: row.verifier };
}

export function pkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function buildAuthorizeUrl(
  redis: IORedis | null,
  platform: SocialPlatform,
  userId: string,
): Promise<string> {
  const redir = encodeURIComponent(redirectUri(platform));
  if (platform === "youtube") {
    const state = await putOauthState(redis, platform, userId);
    const id = process.env["GOOGLE_OAUTH_CLIENT_ID"] ?? "";
    const scope = encodeURIComponent(
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    );
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(id)}&redirect_uri=${redir}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  }
  if (platform === "tiktok") {
    const state = await putOauthState(redis, platform, userId);
    const key = process.env["TIKTOK_CLIENT_KEY"] ?? "";
    const scope = encodeURIComponent("user.info.basic,video.upload,video.publish");
    return `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(key)}&redirect_uri=${redir}&response_type=code&scope=${scope}&state=${state}`;
  }
  if (platform === "facebook") {
    const state = await putOauthState(redis, platform, userId);
    const id = process.env["FACEBOOK_APP_ID"] ?? "";
    const scope = encodeURIComponent(
      "pages_show_list,pages_read_engagement,pages_manage_posts,publish_video",
    );
    return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(id)}&redirect_uri=${redir}&state=${state}&scope=${scope}`;
  }
  if (platform === "x") {
    const verifier = pkceVerifier();
    const state = await putOauthState(redis, platform, userId, verifier);
    const id = process.env["X_CLIENT_ID"] ?? "";
    const scope = encodeURIComponent(
      "tweet.read tweet.write users.read offline.access media.write",
    );
    const challenge = pkceChallenge(verifier);
    return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(id)}&redirect_uri=${redir}&scope=${scope}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
  }
  throw new Error("Bilibili se conecta con SESSDATA, no OAuth");
}

async function tokenJson(
  url: string,
  body: URLSearchParams,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok)
    throw new Error(
      String(json["error_description"] ?? json["error"] ?? json["message"] ?? res.statusText),
    );
  return json;
}

export async function exchangeCode(
  platform: SocialPlatform,
  code: string,
  verifier?: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  extra?: Record<string, string>;
  handle?: string;
}> {
  const redir = redirectUri(platform);
  if (platform === "youtube") {
    const json = await tokenJson(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: process.env["GOOGLE_OAUTH_CLIENT_ID"] ?? "",
        client_secret: process.env["GOOGLE_OAUTH_CLIENT_SECRET"] ?? "",
        redirect_uri: redir,
        grant_type: "authorization_code",
      }),
    );
    const accessToken = String(json["access_token"] ?? "");
    const ch = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const data = (await ch.json()) as { items?: { snippet?: { title?: string } }[] };
    return {
      accessToken,
      refreshToken: json["refresh_token"] ? String(json["refresh_token"]) : undefined,
      expiresAt: Date.now() + Number(json["expires_in"] ?? 3600) * 1000,
      handle: data.items?.[0]?.snippet?.title,
    };
  }
  if (platform === "tiktok") {
    const json = await tokenJson(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env["TIKTOK_CLIENT_KEY"] ?? "",
        client_secret: process.env["TIKTOK_CLIENT_SECRET"] ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: redir,
      }),
    );
    return {
      accessToken: String(json["access_token"] ?? ""),
      refreshToken: json["refresh_token"] ? String(json["refresh_token"]) : undefined,
      expiresAt: Date.now() + Number(json["expires_in"] ?? 86400) * 1000,
      handle: json["open_id"] ? String(json["open_id"]).slice(0, 12) : undefined,
    };
  }
  if (platform === "facebook") {
    const json = await tokenJson(
      "https://graph.facebook.com/v21.0/oauth/access_token",
      new URLSearchParams({
        client_id: process.env["FACEBOOK_APP_ID"] ?? "",
        client_secret: process.env["FACEBOOK_APP_SECRET"] ?? "",
        redirect_uri: redir,
        code,
      }),
    );
    const userToken = String(json["access_token"] ?? "");
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(userToken)}`,
    );
    const pages = (await pagesRes.json()) as {
      data?: { id: string; name: string; access_token: string }[];
    };
    const page = pages.data?.[0];
    if (!page)
      throw new Error("No hay una Página de Facebook. Crea una Página y vuelve a conectar.");
    return {
      accessToken: page.access_token,
      handle: page.name,
      extra: { pageId: page.id },
    };
  }
  const basic = Buffer.from(
    `${process.env["X_CLIENT_ID"]}:${process.env["X_CLIENT_SECRET"]}`,
  ).toString("base64");
  const json = await tokenJson(
    "https://api.x.com/2/oauth2/token",
    new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redir,
      code_verifier: verifier ?? "",
    }),
    { Authorization: `Basic ${basic}` },
  );
  const accessToken = String(json["access_token"] ?? "");
  const me = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meJson = (await me.json()) as { data?: { username?: string } };
  return {
    accessToken,
    refreshToken: json["refresh_token"] ? String(json["refresh_token"]) : undefined,
    expiresAt: Date.now() + Number(json["expires_in"] ?? 7200) * 1000,
    handle: meJson.data?.username ? `@${meJson.data.username}` : undefined,
  };
}
