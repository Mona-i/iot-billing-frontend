import BigNumber from 'bignumber.js';

const SOROBAN_DECIMALS = 7;

export function fromSorobanInt(raw: string | bigint, decimals: number = SOROBAN_DECIMALS): string {
  const value = new BigNumber(raw.toString());
  const divisor = new BigNumber(10).pow(decimals);
  return value.div(divisor).toFixed(decimals, BigNumber.ROUND_HALF_UP);
}

export function toSorobanInt(
  display: string | number,
  decimals: number = SOROBAN_DECIMALS,
): string {
  const value = new BigNumber(display);
  const multiplier = new BigNumber(10).pow(decimals);
  return value.times(multiplier).integerValue(BigNumber.ROUND_HALF_UP).toString();
}

export function formatCurrency(amount: string | number, decimals: number = 2): string {
  try {
    const value = new BigNumber(amount);
    if (value.isNaN()) return '0.00';
    return value.toFormat(decimals, BigNumber.ROUND_HALF_UP);
  } catch {
    return '0.00';
  }
}

export function formatCompact(amount: string | number): string {
  const value = new BigNumber(amount);
  if (value.isNaN()) return '0';
  if (value.isLessThan(1000)) return value.toFormat(2);
  if (value.isLessThan(1_000_000)) return value.dividedBy(1000).toFormat(1) + 'K';
  if (value.isLessThan(1_000_000_000)) return value.dividedBy(1_000_000).toFormat(1) + 'M';
  return value.dividedBy(1_000_000_000).toFormat(1) + 'B';
}

export function compareBalances(a: string, b: string): number {
  return new BigNumber(a).comparedTo(new BigNumber(b)) ?? 0;
}
