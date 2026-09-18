import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { draftBeatsTemplate } from "./draft.js";
import {
  createJob,
  hydrateJobFromSnapshot,
  isVoxSharedVolumeEntry,
  jobDir,
  listJobs,
  migrateLegacyVoxJobs,
  readBeats,
  saveJobSnapshot,
  voxJobsDir,
  writeBeats,
} from "./store.js";
import type { VoxJobConfig } from "./types.js";

const config: VoxJobConfig = {
  mode: "broll",
  topic: "dinero",
  durationSec: 15,
  aspect: "9:16",
  language: "es",
  arc: "hook_payoff",
  voiceId: "leo",
  voiceSpeed: 1,
  themes: ["punk-zine"],
  videoModel: "x",
  imageModel: "y",
  motionStyle: "punchy",
  constraints: "strict",
  music: "x",
  captions: true,
  captionStyle: "white",
  watermark: "w",
  realPeople: false,
};

describe("vox store", () => {
  const prevVox = process.env["VOX_JOBS_DIR"];
  const prevJobs = process.env["JOBS_DIR"];
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-jobs-"));
    process.env["VOX_JOBS_DIR"] = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (prevVox) process.env["VOX_JOBS_DIR"] = prevVox;
    else delete process.env["VOX_JOBS_DIR"];
    if (prevJobs) process.env["JOBS_DIR"] = prevJobs;
    else delete process.env["JOBS_DIR"];
  });

  it("keeps vox jobs isolated from Short/Film job folders", () => {
    const meta = createJob("user-1", config);
    expect(meta.id.startsWith("vox-")).toBe(true);
    expect(meta.kind).toBe("vox");
    writeBeats(meta.id, draftBeatsTemplate(config, "dinero-15s"));
    expect(readBeats(meta.id)?.style).toBe("collage");
    expect(listJobs("user-1")).toHaveLength(1);
    expect(listJobs("other")).toHaveLength(0);
    expect(meta.createdAt).toBeTruthy();
  });

  it("stores vox jobs on JOBS_DIR, not a nestable /vox mount", () => {
    delete process.env["VOX_JOBS_DIR"];
    process.env["JOBS_DIR"] = path.join(os.tmpdir(), "openreels-jobs");
    expect(voxJobsDir()).toBe(process.env["JOBS_DIR"]);
    process.env["VOX_JOBS_DIR"] = path.join(process.env["JOBS_DIR"], "vox");
    expect(voxJobsDir()).toBe(process.env["JOBS_DIR"]);
    expect(isVoxSharedVolumeEntry("vox")).toBe(true);
    expect(isVoxSharedVolumeEntry("vox-8d6aff31")).toBe(true);
    expect(isVoxSharedVolumeEntry("abc123")).toBe(false);
  });

  it("lifts nested jobs/vox/<id> onto JOBS_DIR/<id>", () => {
    const jobsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "or-jobs-"));
    const id = "vox-nested01";
    fs.mkdirSync(path.join(jobsRoot, "vox", id), { recursive: true });
    fs.writeFileSync(path.join(jobsRoot, "vox", id, "meta.json"), JSON.stringify({ id, kind: "vox" }));
    delete process.env["VOX_JOBS_DIR"];
    process.env["JOBS_DIR"] = jobsRoot;
    try {
      expect(migrateLegacyVoxJobs()).toBe(1);
      expect(fs.existsSync(path.join(jobsRoot, id, "meta.json"))).toBe(true);
    } finally {
      fs.rmSync(jobsRoot, { recursive: true, force: true });
    }
  });

  it("hydrates a missing job from the Redis snapshot", async () => {
    const meta = createJob("user-1", config);
    writeBeats(meta.id, draftBeatsTemplate(config, "dinero-15s"));
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
    expect(readBeats(meta.id)).toBeNull();
    await hydrateJobFromSnapshot(redis as never, meta.id);
    expect(readBeats(meta.id)?.style).toBe("collage");
  });

  it("migrates leftover jobs from the old isolated folder", () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "vox-shared-"));
    const legacyRoot = path.join(process.cwd(), "vox-jobs");
    const id = "vox-migtest01";
    const legacyJob = path.join(legacyRoot, id);
    fs.mkdirSync(legacyJob, { recursive: true });
    fs.writeFileSync(path.join(legacyJob, "meta.json"), JSON.stringify({ id, kind: "vox" }));
    process.env["VOX_JOBS_DIR"] = dest;
    try {
      expect(migrateLegacyVoxJobs()).toBe(1);
      expect(fs.existsSync(path.join(dest, id, "meta.json"))).toBe(true);
      expect(migrateLegacyVoxJobs()).toBe(0);
    } finally {
      fs.rmSync(legacyJob, { recursive: true, force: true });
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });
});
