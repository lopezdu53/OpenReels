import { describe, expect, it } from "vitest";
import { pickTobyInboxTarget, TOBY_PENDING_STALE_MS } from "./inbox.js";

describe("Toby inbox target", () => {
  it("gives the file to the newest live Lab wait, not a leftover pending", () => {
    const now = 1_000_000;
    const { newest, stale } = pickTobyInboxTarget(
      [
        { id: "old", kind: "image", createdAt: now - TOBY_PENDING_STALE_MS - 1000 },
        { id: "lab", kind: "image", createdAt: now - 2000 },
        { id: "older-lab", kind: "image", createdAt: now - 8000 },
        { id: "vid", kind: "video", createdAt: now },
      ],
      "image",
      now,
    );
    expect(newest?.id).toBe("lab");
    expect(stale.map((j) => j.id)).toEqual(["old"]);
  });
});
