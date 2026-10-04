import { describe, expect, it, vi } from "vitest";
import { GflowCliError } from "../gflow/errors.js";

const runGflowJson = vi.fn();

vi.mock("../gflow/client.js", () => ({
  GflowCliError,
  runGflowJson: (...args: unknown[]) => runGflowJson(...args),
}));

import {
  buildGflowVideoCliArgs,
  isDurationControlError,
  runGflowVideoWithDurationFallback,
  stripDurationFlag,
} from "./gflow.js";

describe("gflow video CLI", () => {
  it("omits --duration for omni-flash and always sends --model omni-flash", () => {
    const args = buildGflowVideoCliArgs({
      mode: "t2v",
      prompt: "a cat walks",
      model: "omni-flash",
      aspect: "9:16",
      dest: "/tmp/out.mp4",
      durationSeconds: 10,
    });
    expect(args).toContain("omni-flash");
    expect(args).toContain("--model");
    expect(args).not.toContain("--duration");
    expect(args.slice(0, 3)).toEqual(["video", "t2v", "a cat walks"]);
  });

  it("retries once without --duration on ConfigurationError duration control", async () => {
    const first = [
      "video",
      "t2v",
      "pan",
      "--model",
      "omni-flash",
      "--duration",
      "10",
      "--aspect",
      "9:16",
      "-o",
      "/tmp/out.mp4",
    ];
    runGflowJson
      .mockRejectedValueOnce(
        new Error(
          "ConfigurationError: the migrated Flow host renders no duration control offering '10s'",
        ),
      )
      .mockResolvedValueOnce({ status: "ok", local_path: "/tmp/out.mp4" });
    const notes: string[] = [];
    const payload = await runGflowVideoWithDurationFallback(first, 1000, () =>
      notes.push("fallback"),
    );
    expect(payload.status).toBe("ok");
    expect(runGflowJson).toHaveBeenCalledTimes(2);
    expect(runGflowJson.mock.calls[1]?.[0]).toEqual(stripDurationFlag(first));
    expect(runGflowJson.mock.calls[1]?.[0]).not.toContain("--duration");
    expect(notes).toEqual(["fallback"]);
    expect(
      isDurationControlError(
        "ConfigurationError: the migrated Flow host renders no duration control offering '10s'",
      ),
    ).toBe(true);
  });
});
