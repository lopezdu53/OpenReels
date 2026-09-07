import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { draftBeatsTemplate } from "./draft.js";
import { createJob, listJobs, readBeats, writeBeats } from "./store.js";
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
  const prev = process.env["VOX_JOBS_DIR"];
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-jobs-"));
    process.env["VOX_JOBS_DIR"] = dir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (prev) process.env["VOX_JOBS_DIR"] = prev;
    else delete process.env["VOX_JOBS_DIR"];
  });

  it("keeps vox jobs out of the OpenReels jobs directory", () => {
    const meta = createJob("user-1", config);
    expect(meta.id.startsWith("vox-")).toBe(true);
    expect(meta.kind).toBe("vox");
    writeBeats(meta.id, draftBeatsTemplate(config, "dinero-15s"));
    expect(readBeats(meta.id)?.style).toBe("collage");
    expect(listJobs("user-1")).toHaveLength(1);
    expect(listJobs("other")).toHaveLength(0);
    expect(meta.createdAt).toBeTruthy();
    expect(dir).not.toContain(`${path.sep}jobs${path.sep}`);
  });
});
