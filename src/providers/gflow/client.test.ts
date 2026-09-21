import { describe, expect, it } from "vitest";
import { GflowCliError, parseGflowJson } from "./client.js";

describe("gflow json contract", () => {
  it("reads the --json image payload", () => {
    const payload = parseGflowJson(`noise
{
  "status": "ok",
  "command": "image t2i",
  "images": [{ "local_path": "/tmp/hero.png" }]
}
`);
    expect(payload.status).toBe("ok");
    expect((payload.images as { local_path: string }[])[0]?.local_path).toBe("/tmp/hero.png");
  });

  it("reads a video local_path", () => {
    const payload = parseGflowJson(JSON.stringify({
      status: "ok",
      command: "video i2v",
      local_path: "/tmp/clip.mp4",
    }));
    expect(payload.local_path).toBe("/tmp/clip.mp4");
  });

  it("throws when stdout has no JSON", () => {
    expect(() => parseGflowJson("no json here")).toThrow(GflowCliError);
  });
});
