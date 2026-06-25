'use client';

/**
 * useDoppelgangerDetection
 *
 * Orchestrates the full doppelganger detection pipeline:
 *  1. Fetches current epoch from the beacon node
 *  2. Fetches attestation records for each monitored key (last 2 epochs)
 *  3. Dispatches key batches (≤1,000 each) to the scanner worker
 *  4. Applies maintenance-window suppression
 *  5. Deduplicates via alertDeduplicator (24 h window)
 *  6. Returns active doppelganger alerts + control functions
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DoppelgangerResult, ValidatorKeyConfig } from '@/utils/doppelgangerDetector';
import { buildDedupKey, isDuplicate, markAlerted } from '@/utils/alertDeduplicator';
import {
  fetchAttestationRecords,
  fetchCurrentEpoch,
} from '@/services/beaconChainService';
import { DETECTION_EPOCH_WINDOW } from '@/utils/doppelgangerDetector';
import type { ScanKeyPayload } from '@/workers/doppelgangerScannerWorker';

export interface DoppelgangerAlert {
  id: string;
  result: DoppelgangerResult;
  acknowledgedAt?: number;
}

export interface MaintenanceWindow {
  /** ISO 8601 string or timestamp for start of maintenance period */
  start: number;
  /** ISO 8601 string or timestamp for end of maintenance period */
  end: number;
  /** Node IDs under maintenance — detection is suppressed for these */
  nodeIds: string[];
}

export interface UseDoppelgangerDetectionOptions {
  /** List of validator keys to monitor */
  keys: ValidatorKeyConfig[];
  /** Optional maintenance windows; detection suppressed during these */
  maintenanceWindows?: MaintenanceWindow[];
  /** Polling interval in ms (default: 64,000 ms ≈ half an epoch) */
  pollIntervalMs?: number;
  /** Whether detection is active (default: true) */
  enabled?: boolean;
}

const BATCH_SIZE = 1_000;
const DEFAULT_POLL_INTERVAL_MS = 64_000;

function createWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  try {
    return new Worker(
      new URL('../workers/doppelgangerScannerWorker.ts', import.meta.url),
      { type: 'module' },
    );
  } catch {
    return null;
  }
}

function isInMaintenanceWindow(
  nodeId: string,
  windows: MaintenanceWindow[],
  now: number,
): boolean {
  return windows.some(
    (w) => w.start <= now && now <= w.end && w.nodeIds.includes(nodeId),
  );
}

export function useDoppelgangerDetection({
  keys,
  maintenanceWindows = [],
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  enabled = true,
}: UseDoppelgangerDetectionOptions) {
  const [alerts, setAlerts] = useState<DoppelgangerAlert[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const pendingBatchesRef = useRef(new Set<string>());
  const pendingResultsRef = useRef<DoppelgangerResult[]>([]);

  // Stable serialised key list to use as effect dependency
  const keysKey = JSON.stringify(keys.map((k) => k.pubkey));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initialise worker once
  useEffect(() => {
    workerRef.current = createWorker();

    const worker = workerRef.current;
    if (!worker) return;

    worker.onmessage = (
      event: MessageEvent<
        | { type: 'scanResult'; batchId: string; results: DoppelgangerResult[] }
        | { type: 'scanError'; batchId: string; error: string }
      >,
    ) => {
      const { type, batchId } = event.data;

      pendingBatchesRef.current.delete(batchId);

      if (type === 'scanResult') {
        pendingResultsRef.current.push(...event.data.results);
      } else if (type === 'scanError') {
        if (mountedRef.current) {
          setScanError(event.data.error);
        }
      }

      // All batches resolved
      if (pendingBatchesRef.current.size === 0) {
        const now = Date.now();
        const allResults = pendingResultsRef.current;
        pendingResultsRef.current = [];

        if (!mountedRef.current) return;

        setLastScanAt(now);
        setIsScanning(false);

        // Filter to detections only, apply maintenance suppression + dedup
        const newAlerts: DoppelgangerAlert[] = [];
        for (const result of allResults) {
          if (!result.isDoppelganger) continue;
          if (isInMaintenanceWindow(result.expectedNodeId, maintenanceWindows, now)) continue;

          const dedupKey = buildDedupKey(result.pubkey, result.unrecognisedPeerIds);
          if (isDuplicate(dedupKey)) continue;

          markAlerted(dedupKey);
          newAlerts.push({
            id: `${result.pubkey}_${now}`,
            result,
          });
        }

        if (newAlerts.length > 0) {
          setAlerts((prev) => [...newAlerts, ...prev]);
        }
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runScan = useCallback(async () => {
    if (!enabled || keys.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsScanning(true);
    setScanError(null);

    try {
      const currentEpoch = await fetchCurrentEpoch(controller.signal);
      const fromEpoch = Math.max(0, currentEpoch - DETECTION_EPOCH_WINDOW + 1);

      // Fetch attestation records for every monitored key
      const payloads: ScanKeyPayload[] = await Promise.all(
        keys.map(async (k) => {
          try {
            const records = await fetchAttestationRecords(
              k.pubkey,
              fromEpoch,
              currentEpoch,
              controller.signal,
            );
            return {
              pubkey: k.pubkey,
              expectedNodeId: k.expectedNodeId,
              label: k.label,
              attestationRecords: records,
            };
          } catch {
            // If attestation fetch fails for a key, use empty records
            return {
              pubkey: k.pubkey,
              expectedNodeId: k.expectedNodeId,
              label: k.label,
              attestationRecords: [],
            };
          }
        }),
      );

      if (controller.signal.aborted || !mountedRef.current) return;

      const worker = workerRef.current;
      if (!worker) {
        // Fallback: run synchronously in main thread
        const { evaluateDoppelganger: evaluate } = await import('@/utils/doppelgangerDetector');
        const now = Date.now();
        const newAlerts: DoppelgangerAlert[] = [];

        for (const payload of payloads) {
          const result = evaluate(
            {
              pubkey: payload.pubkey,
              expectedNodeId: payload.expectedNodeId,
              label: payload.label,
            },
            payload.attestationRecords,
          );
          if (!result.isDoppelganger) continue;
          if (isInMaintenanceWindow(result.expectedNodeId, maintenanceWindows, now)) continue;
          const dedupKey = buildDedupKey(result.pubkey, result.unrecognisedPeerIds);
          if (isDuplicate(dedupKey)) continue;
          markAlerted(dedupKey);
          newAlerts.push({ id: `${result.pubkey}_${now}`, result });
        }

        if (mountedRef.current) {
          setLastScanAt(now);
          setIsScanning(false);
          if (newAlerts.length > 0) {
            setAlerts((prev) => [...newAlerts, ...prev]);
          }
        }
        return;
      }

      // Dispatch key batches to the worker
      pendingResultsRef.current = [];
      pendingBatchesRef.current.clear();

      const batches: ScanKeyPayload[][] = [];
      for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
        batches.push(payloads.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        const batchId = `batch_${Date.now()}_${i}`;
        pendingBatchesRef.current.add(batchId);
        worker.postMessage({ type: 'scan', batchId, keys: batches[i] });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (mountedRef.current) {
        setScanError(err instanceof Error ? err.message : 'Doppelganger scan failed');
        setIsScanning(false);
      }
    }
  }, [enabled, keys, maintenanceWindows]);

  // Poll on mount and on interval
  useEffect(() => {
    if (!enabled || keys.length === 0) return;

    runScan();
    const interval = setInterval(runScan, pollIntervalMs);

    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
    // keysKey gives a stable dep representing the key list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, keysKey, pollIntervalMs, runScan]);

  /** Acknowledge an alert — marks it in state and optionally re-enables future alerting */
  const acknowledge = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledgedAt: Date.now() } : a)),
    );
  }, []);

  /**
   * Suppress an alert for the next 24 h by refreshing the dedup entry and
   * removing it from the active alert list.
   */
  const suppress = useCallback((alertId: string) => {
    setAlerts((prev) => {
      const target = prev.find((a) => a.id === alertId);
      if (target) {
        markAlerted(buildDedupKey(target.result.pubkey, target.result.unrecognisedPeerIds));
      }
      return prev.filter((a) => a.id !== alertId);
    });
  }, []);

  /** Dismiss all alerts from the UI without affecting dedup state */
  const clearAlerts = useCallback(() => setAlerts([]), []);

  return {
    alerts,
    isScanning,
    lastScanAt,
    scanError,
    acknowledge,
    suppress,
    clearAlerts,
    runScan,
  };
}
