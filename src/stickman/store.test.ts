import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { draftScriptTemplate } from "./draft.js";
import {
  createJob,
  hydrateJobFromSnapshot,
  isStickmanFinalReady,
  isStickmanSharedVolumeEntry,
  jobDir,
  listJobs,
  readMeta,
  readScript,
  saveJobSnapshot,
  setStatus,
  stickmanJobsDir,
  throwIfStickmanStopped,
  writeMeta,
  writeScript,
} from "./store.js";
import type { StickmanJobConfig } from "./types.js";

const config: StickmanJobConfig = {
  topic: "por qué el café miente",
  durationSec: 10,
  aspect: "9:16",
  language: "es",
  look: "classic",
  castMode: "solo",
  arc: "joke_punchline",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: true,
  animate: false,
  imageModel: "x",
  videoModel: "y",
  atlasTtsModel: "xai/tts-v1",
};

describe("stickman store", () => {
  const prevStick = process.env["STICKMAN_JOBS_DIR"];
  const prevJobs = process.env["JOBS_DIR"];
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-jobs-"));
    process.env["STICKMAN_JOBS_DIR"] = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (prevStick) process.env["STICKMAN_JOBS_DIR"] = prevStick;
    else delete process.env["STICKMAN_JOBS_DIR"];
    if (prevJobs) process.env["JOBS_DIR"] = prevJobs;
    else delete process.env["JOBS_DIR"];
  });

  it("keeps stickman jobs isolated from Short/Film/Vox folders", () => {
    const meta = createJob("user-1", config);
    expect(meta.id.startsWith("stickman-")).toBe(true);
    expect(meta.kind).toBe("stickman");
    writeScript(meta.id, draftScriptTemplate(config, "cafe-15s"));
    expect(readScript(meta.id)?.style).toBe("stickman");
    expect(listJobs("user-1")).toHaveLength(1);
    expect(listJobs("other")).toHaveLength(0);
  });

  it("keeps historia jobs off the stickman list", () => {
    createJob("user-1", { ...config, kind: "historia", look: "casting" });
    createJob("user-1", config);
    expect(listJobs("user-1", 30, "stickman")).toHaveLength(1);
    expect(listJobs("user-1", 30, "historia")).toHaveLength(1);
    expect(listJobs("user-1", 30, "historia")[0]?.kind).toBe("historia");
  });

  it("appends stage lines to log.txt so take errors survive the last status", () => {
    const meta = createJob("user-1", config);
    setStatus(meta.id, "producing", "motion", "take 1/2 ok");
    setStatus(meta.id, "producing", "motion", "take 2/2 I2V 10s…");
    const log = fs.readFileSync(path.join(jobDir(meta.id), "log.txt"), "utf8");
    expect(log).toContain("take 1/2 ok");
    expect(log).toContain("take 2/2 I2V 10s");
  });

  it("stores stickman jobs on JOBS_DIR, not a nestable /stickman mount", () => {
    delete process.env["STICKMAN_JOBS_DIR"];
    process.env["JOBS_DIR"] = path.join(os.tmpdir(), "openreels-jobs");
    expect(stickmanJobsDir()).toBe(process.env["JOBS_DIR"]);
    process.env["STICKMAN_JOBS_DIR"] = path.join(process.env["JOBS_DIR"], "stickman");
    expect(stickmanJobsDir()).toBe(process.env["JOBS_DIR"]);
    expect(isStickmanSharedVolumeEntry("stickman")).toBe(true);
    expect(isStickmanSharedVolumeEntry("stickman-8d6aff31")).toBe(true);
    expect(isStickmanSharedVolumeEntry("vox-8d6aff31")).toBe(false);
    expect(isStickmanSharedVolumeEntry("abc123")).toBe(false);
  });

  it("hydrates a missing job from the Redis snapshot", async () => {
    const meta = createJob("user-1", config);
    writeScript(meta.id, draftScriptTemplate(config, "cafe-15s"));
    const mem = new Map<string, string>();
    const redis = {
      async set(key: string, value: string) {
        mem.set(key, value);
        return "OK";
      },
      async get(key: string) {
        return mem.get(key) ?? null;
      },
    };
    await saveJobSnapshot(redis as never, meta.id);
    fs.rmSync(jobDir(meta.id), { recursive: true, force: true });
    expect(readScript(meta.id)).toBeNull();
    await hydrateJobFromSnapshot(redis as never, meta.id);
    expect(readScript(meta.id)?.style).toBe("stickman");
  });

  it("treats an existing final.mp4 as already produced", () => {
    const meta = createJob("user-1", config);
    expect(isStickmanFinalReady(meta.id)).toBe(false);
    fs.writeFileSync(path.join(jobDir(meta.id), "final.mp4"), Buffer.alloc(25_000));
    expect(isStickmanFinalReady(meta.id)).toBe(true);
  });

  it("throws when the user stops or cancels a producing job", () => {
    const meta = createJob("user-1", config);
    throwIfStickmanStopped(meta.id);
    writeMeta({ ...readMeta(meta.id)!, stopRequested: true });
    expect(() => throwIfStickmanStopped(meta.id)).toThrow("STICKMAN_STOPPED");
    writeMeta({ ...readMeta(meta.id)!, stopRequested: false, cancelRequested: true });
    expect(() => throwIfStickmanStopped(meta.id)).toThrow("STICKMAN_CANCELLED");
  });
});
