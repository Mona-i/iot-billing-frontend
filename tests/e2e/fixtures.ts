/**
 * Playwright fixtures for wallet E2E tests.
 *
 * The `mockWallet` fixture injects window.__MOCK_WALLET_BEHAVIORS before every
 * navigation so the mock freighter-api module picks up the right state.
 */

import { test as base, expect, type Page } from '@playwright/test';
import type { MockWalletBehaviors, MockWalletFailureMode } from '../../src/__mocks__/@stellar/freighter-api';

export { expect };

// ---------------------------------------------------------------------------
// MockWallet helper
// ---------------------------------------------------------------------------
class MockWallet {
  constructor(private readonly page: Page) {}

  /** Set raw behaviors object on window.__MOCK_WALLET_BEHAVIORS */
  async setBehaviors(behaviors: MockWalletBehaviors): Promise<void> {
    await this.page.evaluate((b) => {
      (window as { __MOCK_WALLET_BEHAVIORS?: MockWalletBehaviors }).__MOCK_WALLET_BEHAVIORS = b;
    }, behaviors);
  }

  /** Simulate a connected wallet with the given address */
  async connect(walletAddress: string, network = 'testnet'): Promise<void> {
    await this.setBehaviors({ address: walletAddress, network, isConnected: true });
  }

  /** Simulate a disconnected wallet (no address) */
  async disconnect(): Promise<void> {
    await this.setBehaviors({ isConnected: false });
  }

  /** Make the next signature request fail */
  async rejectSignature(): Promise<void> {
    const current = await this.page.evaluate<MockWalletBehaviors>(
      () => (window as { __MOCK_WALLET_BEHAVIORS?: MockWalletBehaviors }).__MOCK_WALLET_BEHAVIORS ?? {},
    );
    await this.setBehaviors({ ...current, failureMode: 'signature_rejected' });
  }

  /** Make the wallet report a different network (network_mismatch) */
  async switchNetwork(failureMode: MockWalletFailureMode = 'network_mismatch'): Promise<void> {
    const current = await this.page.evaluate<MockWalletBehaviors>(
      () => (window as { __MOCK_WALLET_BEHAVIORS?: MockWalletBehaviors }).__MOCK_WALLET_BEHAVIORS ?? {},
    );
    await this.setBehaviors({ ...current, failureMode });
  }

  /** Reset to a clean connected state */
  async reset(walletAddress: string): Promise<void> {
    await this.setBehaviors({ address: walletAddress, network: 'testnet', isConnected: true });
  }
}

// ---------------------------------------------------------------------------
// Extended test type
// ---------------------------------------------------------------------------
type Fixtures = {
  mockWallet: MockWallet;
};

export const test = base.extend<Fixtures>({
  mockWallet: async ({ page }, use) => {
    // Inject behaviors object before every page load
    await page.addInitScript(() => {
      if (!(window as { __MOCK_WALLET_BEHAVIORS?: unknown }).__MOCK_WALLET_BEHAVIORS) {
        (window as { __MOCK_WALLET_BEHAVIORS?: MockWalletBehaviors }).__MOCK_WALLET_BEHAVIORS = {};
      }
    });

    await use(new MockWallet(page));
  },
});
