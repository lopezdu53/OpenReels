import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth/store.js";
import {
  alreadyPublished,
  countPublicationsOn,
  listSocialPublic,
  recordSocialPublish,
  saveAccount,
} from "./accounts.js";
import { captionFromMeta, resolveVideoFile } from "./run.js";

describe("social publish + streak", () => {
  let dir: string;
  const prev = process.env["DATA_DIR"];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "or-soc-"));
    process.env["DATA_DIR"] = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env["DATA_DIR"];
    else process.env["DATA_DIR"] = prev;
  });

  it("counts each network publish toward today and does not double-count", async () => {
    const user = await createUser({ email: "p@test.com", name: "P", password: "secret123" });
    saveAccount(user.id, "youtube", { autoPublish: true, accessToken: "t", handle: "yt" });
    recordSocialPublish({
      userId: user.id,
      jobId: "job1",
      platform: "youtube",
      url: "https://youtu.be/a",
    });
    recordSocialPublish({
      userId: user.id,
      jobId: "job1",
      platform: "tiktok",
      url: "https://tiktok.com/x",
    });
    recordSocialPublish({
      userId: user.id,
      jobId: "job1",
      platform: "youtube",
      url: "https://youtu.be/a",
    });
    expect(alreadyPublished(user.id, "job1", "youtube")).toBe(true);
    expect(countPublicationsOn(user.id, new Date().toISOString().slice(0, 10))).toBe(2);
    const cards = listSocialPublic(user.id);
    expect(cards.find((c) => c.platform === "youtube")?.publishedToday).toBe(true);
    expect(cards.find((c) => c.platform === "tiktok")?.publishedToday).toBe(true);
    expect(cards.find((c) => c.platform === "x")?.publishedToday).toBe(false);
    expect(JSON.stringify(cards)).not.toContain("accessToken");
  });

  it("builds captions from topic and finds the mp4", () => {
    expect(captionFromMeta({ topic: "Roma en 60s" }).title).toContain("Roma");
    const jobDir = mkdtempSync(path.join(tmpdir(), "or-job-"));
    writeFileSync(path.join(jobDir, "final.mp4"), "x");
    expect(resolveVideoFile(jobDir)).toContain("final.mp4");
    rmSync(jobDir, { recursive: true, force: true });
  });
});
