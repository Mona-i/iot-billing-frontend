/**
 * Mock implementation of @stellar/freighter-api for E2E testing.
 *
 * Activated at build time via NEXT_PUBLIC_MOCK_WALLET=true.
 * Behaviour is controlled at runtime through window.__MOCK_WALLET_BEHAVIORS.
 *
 * Supported failure modes:
 *   "connection_rejected" | "signature_rejected" | "network_mismatch" | "timeout"
 */

export type MockWalletFailureMode =
  | 'connection_rejected'
  | 'signature_rejected'
  | 'network_mismatch'
  | 'timeout';

export interface MockWalletBehaviors {
  failureMode?: MockWalletFailureMode;
  address?: string;
  network?: string;
  isConnected?: boolean;
}

declare global {
  interface Window {
    __MOCK_WALLET_BEHAVIORS?: MockWalletBehaviors;
  }
}

function getBehaviors(): MockWalletBehaviors {
  if (typeof window !== 'undefined' && window.__MOCK_WALLET_BEHAVIORS) {
    return window.__MOCK_WALLET_BEHAVIORS;
  }
  return {};
}

const TIMEOUT_MS = 30_000;

function simulateTimeout<T>(): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Mock wallet timed out')), TIMEOUT_MS),
  );
}

// ---------------------------------------------------------------------------
// getAddress
// ---------------------------------------------------------------------------
export async function getAddress(): Promise<{
  address: string;
  error?: { message: string };
}> {
  const b = getBehaviors();

  if (b.failureMode === 'timeout') {
    return simulateTimeout();
  }

  if (b.failureMode === 'connection_rejected') {
    return { address: '', error: { message: 'User rejected the connection request' } };
  }

  const address = b.address ?? 'GA7QYNF7SOWQ3GLR2BGMGEKOV7Y2QH7FGHMQWZ3WHKC3NUZX2QH7Y2QH7';
  return { address };
}

// ---------------------------------------------------------------------------
// signMessage
// ---------------------------------------------------------------------------
export async function signMessage(
  message: string,
  _options?: { address?: string },
): Promise<{
  signedMessage: string | Buffer;
  error?: { message: string };
}> {
  const b = getBehaviors();

  if (b.failureMode === 'timeout') {
    return simulateTimeout();
  }

  if (b.failureMode === 'signature_rejected') {
    return {
      signedMessage: '',
      error: { message: 'User declined to sign the transaction' },
    };
  }

  // Return a deterministic hex-encoded mock signature
  const mockSignature = Buffer.from(`mock_sig:${message}`).toString('hex');
  return { signedMessage: mockSignature };
}

// ---------------------------------------------------------------------------
// isConnected
// ---------------------------------------------------------------------------
export async function isConnected(): Promise<{
  isConnected: boolean;
  error?: { message: string };
}> {
  const b = getBehaviors();

  if (b.failureMode === 'connection_rejected') {
    return { isConnected: false };
  }

  return { isConnected: b.isConnected !== undefined ? b.isConnected : true };
}

// ---------------------------------------------------------------------------
// getNetwork
// ---------------------------------------------------------------------------
export async function getNetwork(): Promise<{
  network: string;
  networkPassphrase?: string;
  error?: { message: string };
}> {
  const b = getBehaviors();

  if (b.failureMode === 'timeout') {
    return simulateTimeout();
  }

  if (b.failureMode === 'network_mismatch') {
    return {
      network: 'mainnet',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    };
  }

  const network = b.network ?? 'testnet';
  return { network, networkPassphrase: `Mock ${network} passphrase` };
}

// ---------------------------------------------------------------------------
// watchWalletChanges – minimal shim so WalletProvider can instantiate it
// ---------------------------------------------------------------------------
export class WatchWalletChanges {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(intervalMs = 2000) {
    this.intervalMs = intervalMs;
  }

  watch(callback: (params: { address: string; network: string }) => void): void {
    this.intervalId = setInterval(() => {
      const b = getBehaviors();
      if (b.address) {
        callback({
          address: b.address,
          network: b.network ?? 'testnet',
        });
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
