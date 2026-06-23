import type { MockWalletBehaviors } from '../../src/__mocks__/@stellar/freighter-api';

interface Window {
  /** Legacy globals kept for backward compatibility */
  __mockFreighter?: boolean;
  __mockFreighterError?: boolean;
  __mockPublicKey?: string;

  /** New structured mock behaviors used by the mock freighter-api module */
  __MOCK_WALLET_BEHAVIORS?: MockWalletBehaviors;
}
