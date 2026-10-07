import { describe, expect, it } from "vitest";
import { CloudflareVideo } from "./cloudflare.js";

describe("CloudflareVideo", () => {
  it("fails fast because Workers AI has no I2V catalog", async () => {
    process.env["CLOUDFLARE_API_TOKEN"] = "tok";
    const v = new CloudflareVideo("tok");
    await expect(
      v.generate({ sourceImage: Buffer.from("xx"), prompt: "move" }),
    ).rejects.toThrow(/no tiene T2V ni I2V/);
  });
});
