/**
 * Wallet connection flow E2E tests.
 *
 * Uses the mockWallet fixture to drive wallet state rather than relying on
 * window.__mockFreighter globals.
 */

import { test, expect } from './fixtures';

const TEST_PUBLIC_KEY = 'GA7QYNF7SOWQ3GLR2BGMGEKOV7Y2QH7FGHMQWZ3WHKC3NUZX2QH7Y2QH7';

test.describe('Wallet Connection Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display connect button when wallet is disconnected', async ({ page, mockWallet }) => {
    await mockWallet.disconnect();
    await page.reload();
    const connectBtn = page.getByRole('button', { name: /connect.*wallet/i });
    await expect(connectBtn).toBeVisible();
  });

  test('should show connecting state while authenticating', async ({ page }) => {
    const connectBtn = page.getByRole('button', { name: /connect.*wallet/i });
    await connectBtn.click();
    // The spinner / "Connecting" text should appear immediately
    const connecting = page.getByText(/connecting/i);
    await expect(connecting).toBeVisible({ timeout: 5_000 });
  });

  test('should display connected indicator on successful connection', async ({
    page,
    mockWallet,
  }) => {
    await mockWallet.connect(TEST_PUBLIC_KEY);
    const connectBtn = page.getByRole('button', { name: /connect.*wallet/i });
    await connectBtn.click();

    const connectedIndicator = page.getByText(/connected/i);
    await expect(connectedIndicator).toBeVisible({ timeout: 9_000 });
  });

  test('should show escrow deposit modal flow when connected', async ({ page, mockWallet }) => {
    await mockWallet.connect(TEST_PUBLIC_KEY);
    const connectBtn = page.getByRole('button', { name: /connect.*wallet/i });
    await connectBtn.click();
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 9_000 });

    const depositBtn = page.getByRole('button', { name: /deposit/i });
    if (await depositBtn.isVisible()) {
      await depositBtn.click();
      const modal = page.getByText(/deposit to escrow/i);
      await expect(modal).toBeVisible();
    }
  });

  test('should show error state and retry button on connection failure', async ({
    page,
    mockWallet,
  }) => {
    await mockWallet.switchNetwork('connection_rejected');
    await page.reload();

    const connectBtn = page.getByRole('button', { name: /connect.*wallet/i });
    await connectBtn.click();

    const retryBtn = page.getByRole('button', { name: /retry/i });
    await expect(retryBtn).toBeVisible({ timeout: 9_000 });
  });
});
