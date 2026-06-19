'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TelemetryDataPoint {
  timestamp: number;
  value: number;
}

export interface UseChunkedHistoryOptions {
  deviceIds: string[];
  startTime: number;
  endTime: number;
  chunkSizeMs?: number;
}

export interface UseChunkedHistoryResult {
  progressiveData: TelemetryDataPoint[];
  isLoading: boolean;
  pendingRange: { start: number; end: number } | null;
  error: Error | null;
  cancel: () => void;
}

const DEFAULT_CHUNK_SIZE_MS = 86_400_000; // 1 day at 1-second resolution = max 86,400 data points per chunk

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

export function useChunkedHistory({
  deviceIds,
  startTime,
  endTime,
  chunkSizeMs = DEFAULT_CHUNK_SIZE_MS,
}: UseChunkedHistoryOptions): UseChunkedHistoryResult {
  const [progressiveData, setProgressiveData] = useState<TelemetryDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRange, setPendingRange] = useState<{ start: number; end: number } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Create Web Worker for chunk processing
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      workerRef.current = new Worker(
        new URL('../workers/analyticsDataProcessor.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      // Worker creation failed — hook will fall back to inline processing
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Generate non-overlapping chunks from the time range
  const generateChunks = useCallback((): { from: number; to: number }[] => {
    const chunks: { from: number; to: number }[] = [];
    let current = startTime;

    while (current < endTime) {
      const chunkEnd = Math.min(current + chunkSizeMs, endTime);
      chunks.push({ from: current, to: chunkEnd });
      current = chunkEnd;
    }

    return chunks;
  }, [startTime, endTime, chunkSizeMs]);

  // Fetch a single chunk
  const fetchChunk = useCallback(
    async (from: number, to: number, signal: AbortSignal): Promise<TelemetryDataPoint[]> => {
      const params = new URLSearchParams({
        deviceIds: deviceIds.join(','),
        from: from.toString(),
        to: to.toString(),
      });

      const response = await fetch(`/api/telemetry/history?${params}`, { signal });

      if (!response.ok) {
        throw new Error(`Failed to fetch chunk [${from}-${to}]: HTTP ${response.status}`);
      }

      return response.json();
    },
    [deviceIds],
  );

  // Post chunk values to Web Worker for range computation
  const computeRangeInWorker = useCallback((data: TelemetryDataPoint[]): void => {
    const worker = workerRef.current;
    if (!worker) return;

    const values = data.map((d) => d.value);
    worker.postMessage({
      type: 'computeRange',
      payload: { values },
    });
  }, []);

  // Main fetch loop: sequential async iteration over chunks
  useEffect(() => {
    if (deviceIds.length === 0 || startTime >= endTime) return;

    let cancelled = false;

    const abortController = new AbortController();
    abortRef.current = abortController;

    const fetchAllChunks = async () => {
      // Reset state for new fetch at the start of async execution
      if (!cancelled) {
        setError(null);
        setProgressiveData([]);
        setPendingRange(null);
      }

      const chunks = generateChunks();
      if (chunks.length === 0) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      if (!cancelled) setIsLoading(true);

      const accumulated: TelemetryDataPoint[] = [];

      for (const chunk of chunks) {
        if (cancelled || abortController.signal.aborted) break;

        // Update pending range for progressive rendering
        if (!cancelled) setPendingRange({ start: chunk.from, end: chunk.to });

        try {
          const data = await fetchChunk(chunk.from, chunk.to, abortController.signal);

          // Accumulate data progressively
          accumulated.push(...data);
          if (!cancelled) setProgressiveData([...accumulated]);

          // Offload range computation to worker to keep main thread free
          computeRangeInWorker(data);
        } catch (err: unknown) {
          if (isAbortError(err)) break;
          if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
          // Continue with next chunk on error — don't block the pipeline
        }
      }

      if (!cancelled && !abortController.signal.aborted) {
        setPendingRange(null);
        setIsLoading(false);
      }
    };

    fetchAllChunks();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [deviceIds, startTime, endTime, generateChunks, fetchChunk, computeRangeInWorker]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setPendingRange(null);
  }, []);

  return {
    progressiveData,
    isLoading,
    pendingRange,
    error,
    cancel,
  };
}
