import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJob, listJobs, readMeta, writeScript } from "./store.js";

describe("nara store", () => {
  let dir: string;
  const prev = process.env["JOBS_DIR"];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nara-jobs-"));
    process.env["JOBS_DIR"] = dir;
  });

  afterEach(() => {
    if (prev !== undefined) process.env["JOBS_DIR"] = prev;
    else delete process.env["JOBS_DIR"];
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates nara-* jobs and lists by owner", () => {
    const meta = createJob("u1", {
      idea: "café de la tarde",
      durationSec: 30,
      language: "es",
      tone: "neutral",
      ttsProvider: "kokoro",
    });
    expect(meta.id.startsWith("nara-")).toBe(true);
    expect(readMeta(meta.id)?.userId).toBe("u1");
    writeScript(meta.id, {
      title: "Café",
      script: "El café de la tarde.",
      language: "es",
      tone: "neutral",
      idea: "café de la tarde",
      targetWords: 75,
    });
    expect(listJobs("u1")).toHaveLength(1);
    expect(listJobs("other")).toHaveLength(0);
  });
});
