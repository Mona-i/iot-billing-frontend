'use client';

import { useState, useCallback, useRef } from 'react';
import type { Transaction } from '@/types';

interface QueuedTx {
  tx: Transaction;
  retryCount: number;
  maxRetries: number;
  lastAttempt: number;
}

const RETRY_DELAY_BASE = 2000;
const MAX_RETRIES_DEFAULT = 3;

export function useTxRetryQueue(maxRetries: number = MAX_RETRIES_DEFAULT) {
  const [queue, setQueue] = useState<Map<string, QueuedTx>>(new Map());
  const processingRef = useRef(false);

  const enqueue = useCallback(
    (tx: Transaction) => {
      setQueue((prev) => {
        const next = new Map(prev);
        next.set(tx.hash, { tx, retryCount: 0, maxRetries, lastAttempt: Date.now() });
        return next;
      });
    },
    [maxRetries],
  );

  const remove = useCallback((txHash: string) => {
    setQueue((prev) => {
      const next = new Map(prev);
      next.delete(txHash);
      return next;
    });
  }, []);

  const retryFailed = useCallback(
    async (txHash: string, submitFn: () => Promise<string>) => {
      const entry = queue.get(txHash);
      if (!entry) throw new Error('Transaction not found in retry queue');

      if (entry.retryCount >= entry.maxRetries) {
        remove(txHash);
        throw new Error('Max retries exceeded');
      }

      const delay = RETRY_DELAY_BASE * Math.pow(2, entry.retryCount);
      await new Promise((r) => setTimeout(r, delay));

      try {
        const newHash = await submitFn();
        setQueue((prev) => {
          const next = new Map(prev);
          const existing = next.get(txHash);
          if (existing) {
            next.set(txHash, {
              ...existing,
              retryCount: existing.retryCount + 1,
              lastAttempt: Date.now(),
            });
          }
          return next;
        });
        return newHash;
      } catch {
        remove(txHash);
        throw new Error('Retry submission failed');
      }
    },
    [queue, remove],
  );

  const processQueue = useCallback(
    async (submitFn: (tx: Transaction) => Promise<string>) => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        const entries = Array.from(queue.entries()).filter(
          (entry) => entry[1].retryCount < entry[1].maxRetries,
        );

        for (const [hash, entry] of entries) {
          try {
            const delay = RETRY_DELAY_BASE * Math.pow(2, entry.retryCount);
            await new Promise((r) => setTimeout(r, delay));
            await submitFn(entry.tx);
            remove(hash);
          } catch {
            setQueue((prev) => {
              const next = new Map(prev);
              const existing = next.get(hash);
              if (existing) {
                next.set(hash, {
                  ...existing,
                  retryCount: existing.retryCount + 1,
                  lastAttempt: Date.now(),
                });
              }
              return next;
            });
          }
        }
      } finally {
        processingRef.current = false;
      }
    },
    [queue, remove],
  );

  return {
    queue: Array.from(queue.values()),
    enqueue,
    remove,
    retryFailed,
    processQueue,
    isEmpty: queue.size === 0,
  };
}
