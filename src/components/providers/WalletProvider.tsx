'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { WalletMetrics, AssetBalance } from '@/types';

interface WalletContextValue {
  metrics: WalletMetrics | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalances: (publicKey: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

async function getFreighterPublicKey(): Promise<string> {
  const { getAddress } = await import('@stellar/freighter-api');
  const result = await getAddress();
  if (result.error) throw new Error(result.error.message ?? 'Freighter connection failed');
  return result.address;
}

async function getFreighterNetwork(): Promise<'testnet' | 'mainnet' | 'futurenet'> {
  const { getNetwork } = await import('@stellar/freighter-api');
  const result = await getNetwork();
  if (result.error) throw new Error(result.error.message ?? 'Failed to get network');
  const network = result.network;
  if (network !== 'testnet' && network !== 'mainnet' && network !== 'futurenet') {
    return 'testnet';
  }
  return network;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<WalletMetrics | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const refreshBalances = useCallback(async (pk: string) => {
    const response = await fetch(`/api/wallet/balances?publicKey=${pk}`);
    if (response.ok) {
      const balances: AssetBalance[] = await response.json();
      setMetrics((prev) => (prev ? { ...prev, balances } : null));
    }
  }, []);

  const connect = useCallback(async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setIsConnecting(true);
    setError(null);

    try {
      const publicKey = await getFreighterPublicKey();
      if (controller.signal.aborted) return;

      const network = await getFreighterNetwork();
      if (controller.signal.aborted) return;

      const response = await fetch(`/api/wallet/balances?publicKey=${publicKey}`);
      const balances: AssetBalance[] = response.ok ? await response.json() : [];

      if (!controller.signal.aborted) {
        setMetrics({ publicKey, balances, network, isConnected: true });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Wallet connection failed');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsConnecting(false);
        setAbortController(null);
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    setMetrics(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      abortController?.abort();
    };
  }, [abortController]);

  return (
    <WalletContext.Provider
      value={{ metrics, isConnecting, error, connect, disconnect, refreshBalances }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
