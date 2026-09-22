import { describe, expect, it } from "vitest";
import {
  GFLOW_SHARED_JOBS_KEY,
  isPinnedRemoteBridge,
  jobsKeyFor,
  normalizeGflowBridgeId,
  pollKeysFor,
  sanitizeBridgeName,
  sanitizeBridgePeerId,
} from "./bridge-id.js";

describe("gflow bridge id", () => {
  it("normalizes auto, lan and remote ids", () => {
    expect(normalizeGflowBridgeId(undefined)).toBe("auto");
    expect(normalizeGflowBridgeId("")).toBe("auto");
    expect(normalizeGflowBridgeId("auto")).toBe("auto");
    expect(normalizeGflowBridgeId("lan")).toBe("lan");
    expect(normalizeGflowBridgeId("desktop-sala-01")).toBe("desktop-sala-01");
    expect(normalizeGflowBridgeId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    );
    expect(normalizeGflowBridgeId("../hack")).toBe("auto");
    expect(isPinnedRemoteBridge("auto")).toBe(false);
    expect(isPinnedRemoteBridge("lan")).toBe(false);
    expect(isPinnedRemoteBridge("desktop-sala-01")).toBe(true);
  });

  it("routes jobs to a dedicated queue when a PC is pinned", () => {
    expect(jobsKeyFor("auto")).toBe(GFLOW_SHARED_JOBS_KEY);
    expect(jobsKeyFor("lan")).toBe(GFLOW_SHARED_JOBS_KEY);
    expect(jobsKeyFor("pc-oficina-1")).toBe("gflow:bridge:jobs:pc-oficina-1");
    expect(pollKeysFor("pc-oficina-1")).toEqual([
      "gflow:bridge:jobs:pc-oficina-1",
      GFLOW_SHARED_JOBS_KEY,
    ]);
    expect(pollKeysFor("auto")).toEqual([GFLOW_SHARED_JOBS_KEY]);
  });

  it("sanitizes peer names and rejects short ids", () => {
    expect(sanitizeBridgePeerId("ab")).toBeUndefined();
    expect(sanitizeBridgePeerId("pc-sala-01")).toBe("pc-sala-01");
    expect(sanitizeBridgeName("  PC Sala  ")).toBe("PC Sala");
    expect(sanitizeBridgeName("")).toBe("Windows");
  });
});
