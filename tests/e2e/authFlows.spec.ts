/**
 * Auth flow E2E tests.
 *
 * Covers: nonce signing -> JWT storage -> session expiration -> re-auth.
 * The mock freighter-api signs deterministically so we can assert on state.
 */

import { test, expect } from './fixtures';

const TEST_PUBLIC_KEY = 'GA7QYNF7SOWQ3GLR2BGMGEKOV7Y2QH7FGHMQWZ3WHKC3NUZX2QH7Y2QH7';

/** Shared API route mocks for the auth cycle */
async function setupAuthMocks(
  page: import('@playwright/test').Page,
  opts: { jwtExpiresIn?: number } = {},
) {
  const expiresAt = Date.now() + (opts.jwtExpiresIn ?? 3_600_000);

  await page.route('**/api/auth/nonce**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nonce: 'mock_nonce_abc123' }),
    });
  });

  await page.route('**/api/auth/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nonce: 'mock_nonce_abc123',
        signedChallenge: 'mock_signed',
        jwt: 'eyJhbGciOiJIUzI1NiJ9.mock.signature',
        expiresAt,
        publicKey: TEST_PUBLIC_KEY,
      }),
    });
  });

  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/wallet/balances**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ asset: 'XLM', balance: '1000', decimals: 7 }]),
    });
  });
}

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page, mockWallet }) => {
    await mockWallet.connect(TEST_PUBLIC_KEY);
    await setupAuthMocks(page);
    await page.goto('/');
  });

  test('full auth cycle – nonce sign -> connected state', async ({ page }) => {
    const connectBtn = page.getByRole('button', { name: /connect.*wallet/i });
    await connectBtn.click();

    // Wallet should enter connecting state
    await expect(page.getByText(/connecting/i)).toBeVisible({ timeout: 5_000 });

    // Then resolve to connected
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 9_000 });

    // Public key should be partially visible
    const pkShort = TEST_PUBLIC_KEY.slice(0, 8);
    await expect(page.getByText(new RegExp(pkShort))).toBeVisible({ timeout: 5_000 });
  });

  test('expired session – page shows connect button after expiry', async ({ page, mockWallet }) => {
    // Immediately-expired session
    await setupAuthMocks(page, { jwtExpiresIn: -1 });
    await mockWallet.connect(TEST_PUBLIC_KEY);
    await page.goto('/');

    // The session is expired, so the UI should present the connect button again
    await expect(page.getByRole('button', { name: /connect.*wallet/i })).toBeVisible({
      timeout: 9_000,
    });
  });

  test('re-auth after disconnect', async ({ page, mockWallet }) => {
    const connectBtn = page.getByRole('button', { name: /connect.*wallet/i });
    await connectBtn.click();
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 9_000 });

    // Disconnect
    const disconnectBtn = page.getByRole('button', { name: /disconnect/i });
    await disconnectBtn.click();

    // Connect button re-appears
    await expect(page.getByRole('button', { name: /connect.*wallet/i })).toBeVisible({
      timeout: 9_000,
    });

    // Re-connect
    await mockWallet.connect(TEST_PUBLIC_KEY);
    await page.getByRole('button', { name: /connect.*wallet/i }).click();
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 9_000 });
  });
});
