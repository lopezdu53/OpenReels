import { afterEach, describe, expect, it } from "vitest";
import { gflowBridgeToken, gflowBridgeUrl } from "./bridge.js";
import { isGflowBridgeUnreachable } from "./errors.js";
import { gflowRelayEnabled } from "./relay.js";

describe("gflow bridge env", () => {
  const prevUrl = process.env["GFLOW_BRIDGE_URL"];
  const prevToken = process.env["GFLOW_BRIDGE_TOKEN"];
  const prevRelay = process.env["GFLOW_BRIDGE_RELAY"];

  afterEach(() => {
    if (prevUrl === undefined) delete process.env["GFLOW_BRIDGE_URL"];
    else process.env["GFLOW_BRIDGE_URL"] = prevUrl;
    if (prevToken === undefined) delete process.env["GFLOW_BRIDGE_TOKEN"];
    else process.env["GFLOW_BRIDGE_TOKEN"] = prevToken;
    if (prevRelay === undefined) delete process.env["GFLOW_BRIDGE_RELAY"];
    else process.env["GFLOW_BRIDGE_RELAY"] = prevRelay;
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

  it("enables the remote relay when a token is set", () => {
    process.env["GFLOW_BRIDGE_TOKEN"] = "abc";
    delete process.env["GFLOW_BRIDGE_RELAY"];
    expect(gflowRelayEnabled()).toBe(true);
    process.env["GFLOW_BRIDGE_RELAY"] = "0";
    expect(gflowRelayEnabled()).toBe(false);
  });

  it("detects an unreachable Windows box", () => {
    expect(isGflowBridgeUnreachable("No se alcanzó el puente Windows (http://192.168.1.9:8787): fetch failed")).toBe(true);
    expect(isGflowBridgeUnreachable("Ningún Windows remoto conectado")).toBe(true);
    expect(isGflowBridgeUnreachable("Token inválido")).toBe(false);
  });
});
