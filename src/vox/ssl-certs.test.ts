import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Vox HTTPS in Docker", () => {
  it("installs ca-certificates so Python urllib can verify Atlas", () => {
    const docker = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf-8");
    expect(docker).toMatch(/ca-certificates/);
    expect(docker).toMatch(/SSL_CERT_FILE=\/etc\/ssl\/certs\/ca-certificates\.crt/);
  });

  it("loads the system CA bundle in atlas_cloud.py", () => {
    const client = fs.readFileSync(path.join(process.cwd(), "vox/scripts/atlas_cloud.py"), "utf-8");
    expect(client).toMatch(/def ssl_context/);
    expect(client).toContain("context=ssl_context()");
  });
});
