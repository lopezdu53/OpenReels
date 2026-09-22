export type GflowBridgeKind = "auto" | "lan" | "remote";

export interface GflowBridgeChoice {
  id: string;
  label: string;
  note?: string;
  kind: GflowBridgeKind;
  online: boolean;
}

/** Shared Redis list: any remote may pick the job. */
export const GFLOW_SHARED_JOBS_KEY = "gflow:bridge:jobs";

export function normalizeGflowBridgeId(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "auto") return "auto";
  if (s === "lan") return "lan";
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,80}$/.test(s)) return s;
  return "auto";
}

export function isPinnedRemoteBridge(id: string): boolean {
  return id !== "auto" && id !== "lan";
}

export function jobsKeyFor(bridgeId?: string | null): string {
  const id = normalizeGflowBridgeId(bridgeId);
  return isPinnedRemoteBridge(id) ? `gflow:bridge:jobs:${id}` : GFLOW_SHARED_JOBS_KEY;
}

/** Dedicated queue first, then the shared auto queue (old clients). */
export function pollKeysFor(bridgeId?: string | null): string[] {
  const id = normalizeGflowBridgeId(bridgeId);
  if (isPinnedRemoteBridge(id)) return [`gflow:bridge:jobs:${id}`, GFLOW_SHARED_JOBS_KEY];
  return [GFLOW_SHARED_JOBS_KEY];
}

export function sanitizeBridgePeerId(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,80}$/.test(s)) return undefined;
  return s;
}

export function sanitizeBridgeName(raw: unknown, fallback = "Windows"): string {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
  return s || fallback;
}

export function peerKey(id: string): string {
  return `gflow:bridge:peer:${id}`;
}

export const GFLOW_PEERS_SET_KEY = "gflow:bridge:peers";
