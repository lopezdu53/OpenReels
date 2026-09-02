export const SOCIAL_PLATFORMS = ["youtube", "tiktok", "facebook", "x", "bilibili"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(v: string): v is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(v);
}

export interface SocialAccount {
  autoPublish: boolean;
  handle?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  extra?: Record<string, string>;
  connectedAt?: string;
  lastError?: string;
  lastPublishedAt?: string;
  lastUrl?: string;
}

export interface SocialPublic {
  platform: SocialPlatform;
  connected: boolean;
  autoPublish: boolean;
  handle?: string;
  lastError?: string;
  lastPublishedAt?: string;
  lastUrl?: string;
  publishedToday: boolean;
  oauthReady: boolean;
}

export interface SocialPublication {
  id: string;
  jobId: string;
  platform: SocialPlatform;
  url?: string;
  status: "ok" | "error";
  error?: string;
  at: string;
}

export const PLATFORM_META: Record<SocialPlatform, { label: string; color: string; hint: string }> =
  {
    youtube: {
      label: "YouTube",
      color: "#FF0000",
      hint: "Shorts al canal. OAuth de Google con youtube.upload.",
    },
    tiktok: {
      label: "TikTok",
      color: "#000000",
      hint: "Post directo (Content Posting API).",
    },
    facebook: {
      label: "Facebook",
      color: "#1877F2",
      hint: "Reels en tu Página.",
    },
    x: {
      label: "X",
      color: "#111111",
      hint: "Video en un post.",
    },
    bilibili: {
      label: "Bilibili",
      color: "#00A1D6",
      hint: "Subida con SESSDATA (cookie de sesión).",
    },
  };

export function publicBaseUrl(): string {
  const raw =
    process.env["APP_PUBLIC_URL"] ?? process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function oauthReady(platform: SocialPlatform): boolean {
  if (platform === "bilibili") return true;
  if (platform === "youtube") {
    return Boolean(
      process.env["GOOGLE_OAUTH_CLIENT_ID"] && process.env["GOOGLE_OAUTH_CLIENT_SECRET"],
    );
  }
  if (platform === "tiktok") {
    return Boolean(process.env["TIKTOK_CLIENT_KEY"] && process.env["TIKTOK_CLIENT_SECRET"]);
  }
  if (platform === "facebook") {
    return Boolean(process.env["FACEBOOK_APP_ID"] && process.env["FACEBOOK_APP_SECRET"]);
  }
  return Boolean(process.env["X_CLIENT_ID"] && process.env["X_CLIENT_SECRET"]);
}
