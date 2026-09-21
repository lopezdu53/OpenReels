import { describe, expect, it } from "vitest";
import { countdownToYpp, YPP, YPP_CHANGE_AT } from "./ypp.js";

describe("YPP 2027 countdown", () => {
  it("is in the future from 2026 and reports doubled thresholds", () => {
    const c = countdownToYpp(Date.UTC(2026, 8, 1));
    expect(c.expired).toBe(false);
    expect(c.days).toBeGreaterThan(100);
    expect(YPP.watchHours2027).toBe(YPP.watchHoursNow * 2);
    expect(YPP.shortsViews2027).toBe(YPP.shortsViewsNow * 2);
    expect(new Date(YPP_CHANGE_AT).getUTCMonth()).toBe(1);
  });

  it("expires on the change date", () => {
    expect(countdownToYpp(YPP_CHANGE_AT).expired).toBe(true);
    expect(countdownToYpp(YPP_CHANGE_AT).days).toBe(0);
  });
});
