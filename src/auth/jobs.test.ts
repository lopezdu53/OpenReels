import { describe, expect, it } from "vitest";
import { countByDay, type JobMetaLite, streakDays } from "./jobs.js";

function job(id: string, createdAt: string, status = "completed"): JobMetaLite {
  return { id, topic: id, status, createdAt, userId: "u1" };
}

describe("dashboard job helpers", () => {
  it("counts completed jobs per UTC day", () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = countByDay(
      [
        job("a", `${today}T10:00:00.000Z`),
        job("b", `${today}T18:00:00.000Z`),
        job("c", `${today}T09:00:00.000Z`, "failed"),
      ],
      7,
    );
    expect(rows).toHaveLength(7);
    expect(rows[6]?.date).toBe(today);
    expect(rows[6]?.generated).toBe(2);
  });

  it("skips an empty today when counting streak, then counts hits", () => {
    const week = [
      { date: "2026-08-28", generated: 4 },
      { date: "2026-08-29", generated: 4 },
      { date: "2026-08-30", generated: 0 },
      { date: "2026-08-31", generated: 0 },
    ];
    expect(streakDays(week, { "2026-08-30": 4 }, 4)).toBe(3);
    expect(streakDays(week, { "2026-08-29": 0, "2026-08-30": 4 }, 4)).toBe(3);
    expect(streakDays(week, {}, 4)).toBe(0);
  });
});
