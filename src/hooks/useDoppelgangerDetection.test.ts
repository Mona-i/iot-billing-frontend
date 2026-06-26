import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDoppelgangerDetection } from './useDoppelgangerDetection';
import * as alertDedup from '@/utils/alertDeduplicator';
import * as beaconService from '@/services/beaconChainService';
import type { ValidatorKeyConfig } from '@/utils/doppelgangerDetector';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/services/beaconChainService', () => ({
  fetchCurrentEpoch: vi.fn(),
  fetchAttestationRecords: vi.fn(),
}));

vi.mock('@/utils/alertDeduplicator', () => ({
  buildDedupKey: vi.fn(
    (pubkey: string, peers: string[]) =>
      `${pubkey}::${[...peers].sort().join(',')}`,
  ),
  isDuplicate: vi.fn(() => false),
  markAlerted: vi.fn(),
}));

// Worker stub: immediately echo a scanResult back
const mockWorker = {
  onmessage: null as ((e: MessageEvent) => void) | null,
  postMessage: vi.fn((msg: { type: string; batchId: string; keys: unknown[] }) => {
    if (msg.type !== 'scan') return;
    // Simulate worker responding synchronously with empty results
    const handler = mockWorker.onmessage;
    if (handler) {
      setTimeout(() => {
        handler({
          data: { type: 'scanResult', batchId: msg.batchId, results: [] },
        } as MessageEvent);
      }, 0);
    }
  }),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;

  constructor() {
    // Assign the instance's onmessage setter to the mock
    Object.defineProperty(this, 'onmessage', {
      set(fn: (e: MessageEvent) => void) {
        mockWorker.onmessage = fn;
      },
      get() {
        return mockWorker.onmessage;
      },
    });
  }

  postMessage(msg: { type: string; batchId: string; keys: unknown[] }) {
    mockWorker.postMessage(msg);
  }

  terminate() {
    mockWorker.terminate();
  }

  addEventListener(event: string, listener: (e: MessageEvent) => void) {
    mockWorker.addEventListener(event, listener);
  }

  removeEventListener(event: string, listener: (e: MessageEvent) => void) {
    mockWorker.removeEventListener(event, listener);
  }
}

// ── Test setup ───────────────────────────────────────────────────────────────

const KEYS: ValidatorKeyConfig[] = [
  { pubkey: '0xkey1', expectedNodeId: 'node-1', label: 'Validator 1' },
  { pubkey: '0xkey2', expectedNodeId: 'node-2' },
];

describe('useDoppelgangerDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Worker', MockWorker);

    vi.mocked(beaconService.fetchCurrentEpoch).mockResolvedValue(100);
    vi.mocked(beaconService.fetchAttestationRecords).mockResolvedValue([]);
    vi.mocked(alertDedup.isDuplicate).mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initialises with empty alerts and not scanning', () => {
    const { result } = renderHook(() =>
      useDoppelgangerDetection({ keys: KEYS, enabled: false }),
    );

    expect(result.current.alerts).toEqual([]);
    expect(result.current.isScanning).toBe(false);
    expect(result.current.lastScanAt).toBeNull();
    expect(result.current.scanError).toBeNull();
  });

  it('does not scan when enabled=false', async () => {
    renderHook(() => useDoppelgangerDetection({ keys: KEYS, enabled: false }));

    await new Promise((r) => setTimeout(r, 50));
    expect(beaconService.fetchCurrentEpoch).not.toHaveBeenCalled();
  });

  it('does not scan when keys array is empty', async () => {
    renderHook(() => useDoppelgangerDetection({ keys: [], enabled: true }));

    await new Promise((r) => setTimeout(r, 50));
    expect(beaconService.fetchCurrentEpoch).not.toHaveBeenCalled();
  });

  it('calls fetchCurrentEpoch and fetchAttestationRecords on scan', async () => {
    const { result } = renderHook(() =>
      useDoppelgangerDetection({ keys: KEYS, enabled: true, pollIntervalMs: 999_999 }),
    );

    await waitFor(
      () => {
        expect(result.current.lastScanAt).not.toBeNull();
      },
      { timeout: 3000 },
    );

    expect(beaconService.fetchCurrentEpoch).toHaveBeenCalled();
    expect(beaconService.fetchAttestationRecords).toHaveBeenCalledTimes(KEYS.length);
  });

  it('sets scanError when beacon fetch throws', async () => {
    vi.mocked(beaconService.fetchCurrentEpoch).mockRejectedValue(new Error('Beacon down'));

    const { result } = renderHook(() =>
      useDoppelgangerDetection({ keys: KEYS, enabled: true, pollIntervalMs: 999_999 }),
    );

    await waitFor(
      () => {
        expect(result.current.scanError).toBe('Beacon down');
      },
      { timeout: 3000 },
    );
  });

  it('acknowledges an alert', async () => {
    // Provide a foreign-only signing record to trigger doppelganger detection
    vi.mocked(beaconService.fetchAttestationRecords).mockResolvedValue(
      Array.from({ length: 64 }, (_, i) => ({
        slot: i,
        epoch: Math.floor(i / 32),
        signingPeerId: 'foreign-node',
      })),
    );

    const { result } = renderHook(() =>
      useDoppelgangerDetection({ keys: [KEYS[0]!], enabled: true, pollIntervalMs: 999_999 }),
    );

    await waitFor(
      () => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const alertId = result.current.alerts[0]!.id;
    act(() => {
      result.current.acknowledge(alertId);
    });

    const updated = result.current.alerts.find((a) => a.id === alertId);
    expect(updated?.acknowledgedAt).toBeDefined();
  });

  it('suppresses an alert (removes from list)', async () => {
    vi.mocked(beaconService.fetchAttestationRecords).mockResolvedValue(
      Array.from({ length: 64 }, (_, i) => ({
        slot: i,
        epoch: Math.floor(i / 32),
        signingPeerId: 'foreign-node',
      })),
    );

    const { result } = renderHook(() =>
      useDoppelgangerDetection({ keys: [KEYS[0]!], enabled: true, pollIntervalMs: 999_999 }),
    );

    await waitFor(
      () => {
        expect(result.current.alerts.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const alertId = result.current.alerts[0]!.id;
    act(() => {
      result.current.suppress(alertId);
    });

    expect(result.current.alerts.find((a) => a.id === alertId)).toBeUndefined();
    expect(alertDedup.markAlerted).toHaveBeenCalled();
  });

  it('suppresses detection for nodes in a maintenance window', async () => {
    vi.mocked(beaconService.fetchAttestationRecords).mockResolvedValue(
      Array.from({ length: 64 }, (_, i) => ({
        slot: i,
        epoch: Math.floor(i / 32),
        signingPeerId: 'foreign-node',
      })),
    );

    const now = Date.now();
    const maintenanceWindows = [
      {
        start: now - 60_000,
        end: now + 60_000,
        nodeIds: ['node-1'], // expected node for KEYS[0]
      },
    ];

    const { result } = renderHook(() =>
      useDoppelgangerDetection({
        keys: [KEYS[0]!],
        maintenanceWindows,
        enabled: true,
        pollIntervalMs: 999_999,
      }),
    );

    // Wait for scan to complete
    await waitFor(
      () => {
        expect(result.current.lastScanAt).not.toBeNull();
      },
      { timeout: 3000 },
    );

    // Alert should be suppressed because node-1 is in maintenance
    expect(result.current.alerts).toEqual([]);
  });

  it('does not raise duplicate alerts within the dedup window', async () => {
    vi.mocked(beaconService.fetchAttestationRecords).mockResolvedValue(
      Array.from({ length: 64 }, (_, i) => ({
        slot: i,
        epoch: Math.floor(i / 32),
        signingPeerId: 'foreign-node',
      })),
    );
    // Simulate the event already being deduped
    vi.mocked(alertDedup.isDuplicate).mockReturnValue(true);

    const { result } = renderHook(() =>
      useDoppelgangerDetection({ keys: [KEYS[0]!], enabled: true, pollIntervalMs: 999_999 }),
    );

    await waitFor(
      () => {
        expect(result.current.lastScanAt).not.toBeNull();
      },
      { timeout: 3000 },
    );

    expect(result.current.alerts).toEqual([]);
  });

  it('clearAlerts removes all alerts', async () => {
    vi.mocked(beaconService.fetchAttestationRecords).mockResolvedValue(
      Array.from({ length: 64 }, (_, i) => ({
        slot: i,
        epoch: Math.floor(i / 32),
        signingPeerId: 'foreign-node',
      })),
    );

    const { result } = renderHook(() =>
      useDoppelgangerDetection({ keys: [KEYS[0]!], enabled: true, pollIntervalMs: 999_999 }),
    );

    await waitFor(() => expect(result.current.alerts.length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    act(() => {
      result.current.clearAlerts();
    });

    expect(result.current.alerts).toEqual([]);
  });
});
