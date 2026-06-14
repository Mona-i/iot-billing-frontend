const STELLAR_ERROR_MAP: Record<string, string> = {
  tx_bad_seq: 'Transaction sequence number mismatch. Refresh your wallet and try again.',
  tx_insufficient_fee: 'Network fees are too low for current congestion. Increase the fee budget.',
  tx_failed: 'Transaction execution failed on the Soroban network. Check contract parameters.',
  tx_too_late: 'Transaction submission timed out. The network slot has expired.',
  op_underfunded: 'Insufficient balance for this operation, including required fees.',
  op_low_reserve: 'Insufficient native asset reserve. Maintain minimum XLM balance.',
  op_malformed: 'Operation parameters are malformed. Verify all inputs before retrying.',
  op_bad_auth: 'Authorization verification failed. Wallet keys may not match the signer.',
  contract_not_found:
    'The target Soroban contract was not found on this network. Verify contract ID.',
  contract_error: 'The Soroban contract returned an error during execution. Check contract logs.',
  fee_insufficient: 'The fee submitted is below the network minimum for this transaction type.',
  bad_sponsorship: 'Sponsorship configuration is invalid. Contact your contract administrator.',
};

const RPC_ERROR_MAP: Record<string, string> = {
  '-32000': 'RPC server is unavailable. Check your connection to the Stellar RPC endpoint.',
  '-32001': 'Resource exhaustion on RPC. Throttle request rate or upgrade your endpoint plan.',
  '-32002': 'Transaction simulation failed. The contract call parameters may be invalid.',
  '-32601': 'Method not found on RPC. Your Stellar SDK version may be outdated.',
  '-32603': 'Internal RPC error. The node encountered an unexpected condition.',
};

export function decodeError(raw: string): string {
  if (!raw) return 'An unknown error occurred. Please try again.';

  const known = STELLAR_ERROR_MAP[raw];
  if (known) return known;

  const rpcKnown = RPC_ERROR_MAP[raw];
  if (rpcKnown) return rpcKnown;

  if (raw.includes('insufficient')) {
    return 'Insufficient balance or allowance for this transaction.';
  }
  if (raw.includes('timeout') || raw.includes('timed out')) {
    return 'Request timed out. Check your network connection and try again.';
  }
  if (raw.includes('denied') || raw.includes('rejected')) {
    return 'Transaction was rejected by the user or wallet.';
  }
  if (raw.includes('network') || raw.includes('connection')) {
    return 'Network connection error. Please check your internet connection.';
  }

  return `Unhandled error: ${raw.slice(0, 120)}. Contact support with this message.`;
}

export function isRetryableError(raw: string): boolean {
  const retryableCodes = ['tx_bad_seq', 'tx_too_late', 'fee_insufficient', '-32000', '-32001'];
  return retryableCodes.includes(raw);
}
