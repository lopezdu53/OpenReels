import * as fs from "node:fs";
import type { SocialAccount, SocialPlatform } from "./types.js";

export interface UploadInput {
  filePath: string;
  title: string;
  description: string;
  account: SocialAccount;
}

export interface UploadResult {
  url: string;
}

async function refreshGoogle(account: SocialAccount): Promise<string> {
  if (account.accessToken && account.expiresAt && account.expiresAt > Date.now() + 60_000) {
    return account.accessToken;
  }
  if (!account.refreshToken) {
    if (!account.accessToken) throw new Error("Reconecta YouTube");
    return account.accessToken;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: account.refreshToken,
      client_id: process.env["GOOGLE_OAUTH_CLIENT_ID"] ?? "",
      client_secret: process.env["GOOGLE_OAUTH_CLIENT_SECRET"] ?? "",
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("No se pudo renovar YouTube. Vuelve a conectar.");
  account.accessToken = json.access_token;
  account.expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
  return json.access_token;
}

async function publishYoutube(input: UploadInput): Promise<UploadResult> {
  const token = await refreshGoogle(input.account);
  const stat = fs.statSync(input.filePath);
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(stat.size),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: input.title.slice(0, 100),
          description: input.description.slice(0, 5000),
          categoryId: "24",
        },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    },
  );
  const location = init.headers.get("location");
  if (!init.ok || !location) {
    const err = await init.text();
    throw new Error(err.slice(0, 240) || "YouTube no inició la subida");
  }
  const buf = fs.readFileSync(input.filePath);
  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(stat.size) },
    body: buf,
  });
  const json = (await put.json()) as { id?: string; error?: { message?: string } };
  if (!put.ok || !json.id) throw new Error(json.error?.message ?? "Fallo al subir a YouTube");
  return { url: `https://youtu.be/${json.id}` };
}

async function publishTiktok(input: UploadInput): Promise<UploadResult> {
  const token = input.account.accessToken;
  if (!token) throw new Error("Reconecta TikTok");
  const stat = fs.statSync(input.filePath);
  const init = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: input.title.slice(0, 150),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: stat.size,
        chunk_size: stat.size,
        total_chunk_count: 1,
      },
    }),
  });
  const json = (await init.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { message?: string };
  };
  const uploadUrl = json.data?.upload_url;
  if (!uploadUrl) throw new Error(json.error?.message ?? "TikTok no dio URL de subida");
  const buf = fs.readFileSync(input.filePath);
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Content-Range": `bytes 0-${stat.size - 1}/${stat.size}`,
    },
    body: buf,
  });
  if (!put.ok) throw new Error(`TikTok upload ${put.status}`);
  return { url: `tiktok://publish/${json.data?.publish_id ?? ""}` };
}

async function publishFacebook(input: UploadInput): Promise<UploadResult> {
  const pageId = input.account.extra?.["pageId"];
  const token = input.account.accessToken;
  if (!pageId || !token) throw new Error("Reconecta Facebook (hace falta una Página)");
  const start = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/video_reels?upload_phase=start&access_token=${encodeURIComponent(token)}`,
    { method: "POST" },
  );
  const started = (await start.json()) as {
    video_id?: string;
    upload_url?: string;
    error?: { message?: string };
  };
  if (!started.video_id || !started.upload_url) {
    throw new Error(started.error?.message ?? "Facebook no inició el Reel");
  }
  const buf = fs.readFileSync(input.filePath);
  const up = await fetch(started.upload_url, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(buf.length),
    },
    body: buf,
  });
  if (!up.ok) throw new Error(`Facebook upload ${up.status}`);
  const finish = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/video_reels?upload_phase=finish&video_id=${started.video_id}&video_state=PUBLISHED&description=${encodeURIComponent(input.title)}&access_token=${encodeURIComponent(token)}`,
    { method: "POST" },
  );
  const done = (await finish.json()) as { success?: boolean; error?: { message?: string } };
  if (!finish.ok) throw new Error(done.error?.message ?? "Facebook no publicó el Reel");
  return { url: `https://facebook.com/reel/${started.video_id}` };
}

async function publishX(input: UploadInput): Promise<UploadResult> {
  const token = input.account.accessToken;
  if (!token) throw new Error("Reconecta X");
  const buf = fs.readFileSync(input.filePath);
  const form = new FormData();
  form.set("media_category", "tweet_video");
  form.set("media", new Blob([new Uint8Array(buf)], { type: "video/mp4" }), "video.mp4");
  const mediaRes = await fetch("https://api.x.com/2/media/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const media = (await mediaRes.json()) as {
    data?: { id?: string };
    id?: string;
    errors?: { message?: string }[];
  };
  const mediaId = media.data?.id ?? media.id;
  if (!mediaId) throw new Error(media.errors?.[0]?.message ?? "X no aceptó el video");
  const tweet = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: input.title.slice(0, 250), media: { media_ids: [mediaId] } }),
  });
  const tw = (await tweet.json()) as { data?: { id?: string }; errors?: { message?: string }[] };
  if (!tw.data?.id) throw new Error(tw.errors?.[0]?.message ?? "X no publicó el post");
  return { url: `https://x.com/i/status/${tw.data.id}` };
}

async function publishBilibili(input: UploadInput): Promise<UploadResult> {
  const sess = input.account.extra?.["sessdata"];
  const jct = input.account.extra?.["biliJct"];
  if (!sess || !jct) throw new Error("Falta SESSDATA / bili_jct");
  const cookie = `SESSDATA=${sess}; bili_jct=${jct}`;
  const nav = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: { cookie } });
  const navJson = (await nav.json()) as { code?: number; data?: { uname?: string } };
  if (navJson.code !== 0) throw new Error("SESSDATA de Bilibili inválida o caducada");
  const stat = fs.statSync(input.filePath);
  const pre = await fetch(
    `https://member.bilibili.com/preupload?name=${encodeURIComponent("openreels.mp4")}&size=${stat.size}&r=upos&profile=ugcupos/bup&ssl=0`,
    { headers: { cookie } },
  );
  if (!pre.ok) throw new Error(`Bilibili preupload ${pre.status}`);
  const preJson = (await pre.json()) as {
    OK?: number;
    endpoint?: string;
    upos_uri?: string;
    auth?: string;
    biz_id?: number;
  };
  if (!preJson.upos_uri || !preJson.endpoint) {
    throw new Error("Bilibili no dio endpoint de subida (revisa la cookie)");
  }
  const uploadUrl = `${preJson.endpoint.replace(/\/$/, "")}/${preJson.upos_uri.replace(/^upos:\/\//, "")}`;
  const buf = fs.readFileSync(input.filePath);
  const put = await fetch(`${uploadUrl}?uploads&output=json`, {
    method: "POST",
    headers: { cookie, "X-Upos-Auth": preJson.auth ?? "", "Content-Type": "application/json" },
  });
  const up = (await put.json()) as { upload_id?: string };
  const part = await fetch(
    `${uploadUrl}?partNumber=1&uploadId=${up.upload_id}&chunk=0&chunks=1&size=${stat.size}&start=0&end=${stat.size - 1}&total=${stat.size}`,
    {
      method: "PUT",
      headers: {
        cookie,
        "X-Upos-Auth": preJson.auth ?? "",
        "Content-Type": "application/octet-stream",
      },
      body: buf,
    },
  );
  if (!part.ok) throw new Error(`Bilibili chunk ${part.status}`);
  await fetch(
    `${uploadUrl}?output=json&name=openreels.mp4&profile=ugcupos%2Fbup&uploadId=${up.upload_id}&biz_id=${preJson.biz_id}`,
    {
      method: "POST",
      headers: { cookie, "X-Upos-Auth": preJson.auth ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ parts: [{ partNumber: 1, eTag: "etag" }] }),
    },
  );
  const add = await fetch(
    `https://member.bilibili.com/x/vu/web/add/v3?csrf=${encodeURIComponent(jct)}`,
    {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        copyright: 1,
        title: input.title.slice(0, 80),
        desc: input.description.slice(0, 250),
        tag: "shorts,openreels",
        tid: 21,
        videos: [{ filename: preJson.upos_uri.split("/").pop(), title: input.title.slice(0, 80) }],
      }),
    },
  );
  const added = (await add.json()) as { code?: number; data?: { bvid?: string }; message?: string };
  if (added.code !== 0 && !added.data?.bvid) {
    throw new Error(added.message ?? "Bilibili no aceptó el envío (a veces pide captcha)");
  }
  const bvid = added.data?.bvid ?? "";
  return { url: bvid ? `https://www.bilibili.com/video/${bvid}` : "https://member.bilibili.com" };
}

const HANDLERS: Record<SocialPlatform, (input: UploadInput) => Promise<UploadResult>> = {
  youtube: publishYoutube,
  tiktok: publishTiktok,
  facebook: publishFacebook,
  x: publishX,
  bilibili: publishBilibili,
};

export async function uploadToPlatform(
  platform: SocialPlatform,
  input: UploadInput,
): Promise<UploadResult> {
  return HANDLERS[platform](input);
}
