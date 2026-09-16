import { describe, expect, it } from "vitest";
import { STICKMAN_LOCK_DURATION_MS, STICKMAN_LOCK_RENEW_MS } from "./worker.js";

describe("stickman worker lock", () => {
  it("keeps the BullMQ lock alive for long Omni I2V (not the 30s default)", () => {
    expect(STICKMAN_LOCK_DURATION_MS).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(STICKMAN_LOCK_RENEW_MS).toBeLessThan(30_000);
    expect(STICKMAN_LOCK_RENEW_MS).toBeLessThan(STICKMAN_LOCK_DURATION_MS / 2);
  });
});
