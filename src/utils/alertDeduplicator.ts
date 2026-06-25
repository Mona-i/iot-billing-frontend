/**
 * Alert deduplication utility.
 *
 * Uses a simple hash-set approach (stored in localStorage) to ensure the
 * same doppelganger event is not re-alerted within a 24-hour window.
 *
 * The localStorage entry is a JSON array of { key, expiresAt } objects.
 * On each check, expired entries are pruned to keep storage lean.
 */

const STORAGE_KEY = 'doppelganger_dedup';
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DedupEntry {
  /** Unique fingerprint for a specific doppelganger event */
  key: string;
  expiresAt: number;
}

function readEntries(): DedupEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DedupEntry[];
  } catch {
    return [];
  }
}

function writeEntries(entries: DedupEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or unavailable – silently ignore
  }
}

function pruneExpired(entries: DedupEntry[]): DedupEntry[] {
  const now = Date.now();
  return entries.filter((e) => e.expiresAt > now);
}

/**
 * Builds a deterministic fingerprint key for a doppelganger detection event
 * so the same physical event can be recognised across page reloads.
 */
export function buildDedupKey(pubkey: string, unrecognisedPeerIds: string[]): string {
  const sortedPeers = [...unrecognisedPeerIds].sort().join(',');
  return `${pubkey}::${sortedPeers}`;
}

/**
 * Returns true if the given key has already been alerted within the 24 h
 * deduplication window.
 */
export function isDuplicate(dedupKey: string): boolean {
  const entries = pruneExpired(readEntries());
  return entries.some((e) => e.key === dedupKey);
}

/**
 * Marks a key as alerted so subsequent calls to `isDuplicate` within the
 * next 24 h return true.  Also prunes expired entries on each write.
 */
export function markAlerted(dedupKey: string): void {
  const fresh = pruneExpired(readEntries());
  // Avoid duplicating the key itself if it is already tracked
  const already = fresh.find((e) => e.key === dedupKey);
  if (already) {
    already.expiresAt = Date.now() + DEDUP_WINDOW_MS;
  } else {
    fresh.push({ key: dedupKey, expiresAt: Date.now() + DEDUP_WINDOW_MS });
  }
  writeEntries(fresh);
}

/**
 * Removes a specific key from the dedup store (e.g., after user acknowledges
 * and explicitly wants to re-enable alerting for it).
 */
export function clearDedupKey(dedupKey: string): void {
  const fresh = pruneExpired(readEntries()).filter((e) => e.key !== dedupKey);
  writeEntries(fresh);
}

/** Removes all dedup entries — intended for testing / full reset. */
export function clearAllDedupEntries(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
