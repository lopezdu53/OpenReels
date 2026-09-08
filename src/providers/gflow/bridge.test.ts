import { afterEach, describe, expect, it } from "vitest";
import { gflowBridgeToken, gflowBridgeUrl } from "./bridge.js";

describe("gflow bridge env", () => {
  const prevUrl = process.env["GFLOW_BRIDGE_URL"];
  const prevToken = process.env["GFLOW_BRIDGE_TOKEN"];

  afterEach(() => {
    if (prevUrl === undefined) delete process.env["GFLOW_BRIDGE_URL"];
    else process.env["GFLOW_BRIDGE_URL"] = prevUrl;
    if (prevToken === undefined) delete process.env["GFLOW_BRIDGE_TOKEN"];
    else process.env["GFLOW_BRIDGE_TOKEN"] = prevToken;
  });

  it("reads the Windows LAN URL without a trailing slash", () => {
    process.env["GFLOW_BRIDGE_URL"] = "http://192.168.1.50:8787/";
    expect(gflowBridgeUrl()).toBe("http://192.168.1.50:8787");
  });

  it("is unset when the Xeon has no bridge", () => {
    delete process.env["GFLOW_BRIDGE_URL"];
    expect(gflowBridgeUrl()).toBeUndefined();
  });

  it("reads the shared token", () => {
    process.env["GFLOW_BRIDGE_TOKEN"] = " secreto ";
    expect(gflowBridgeToken()).toBe("secreto");
  });
});
