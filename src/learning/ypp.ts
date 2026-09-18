/** YouTube Partner Program — current vs 1 Feb 2027 (official blog 10 Aug 2026). */
export const YPP_CHANGE_AT = Date.UTC(2027, 1, 1, 0, 0, 0);

export const YPP = {
  subscribers: 1000,
  fanFundingSubscribers: 500,
  watchHoursNow: 4000,
  watchHours2027: 8000,
  shortsViewsNow: 10_000_000,
  shortsViews2027: 20_000_000,
  shortsPoolViews90d: 10_000_000,
  longformShare: 0.55,
  shortsShare: 0.45,
  premiumPool: 0.3,
  premiumLitePool: 0.6,
} as const;

export function countdownToYpp(nowMs = Date.now()): {
  targetIso: string;
  totalMs: number;
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const totalMs = Math.max(0, YPP_CHANGE_AT - nowMs);
  const expired = nowMs >= YPP_CHANGE_AT;
  const days = Math.floor(totalMs / 86_400_000);
  const hours = Math.floor((totalMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  return {
    targetIso: "2027-02-01T00:00:00.000Z",
    totalMs,
    expired,
    days,
    hours,
    minutes,
    seconds,
  };
}
