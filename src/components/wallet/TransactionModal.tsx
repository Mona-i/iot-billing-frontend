'use client';

import { useState } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { formatCurrency } from '@/utils/currencyFormatter';
import { ErrorDecoder } from '@/utils/errorDecoder';

function ErrorBanner({ decoded, raw }: { decoded: string; raw: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 rounded bg-red-900/30 p-2 text-xs text-red-400">
      <div>{decoded}</div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-1 text-[10px] text-red-500 underline hover:text-red-300"
      >
        {expanded ? 'Hide details' : 'Details'}
      </button>
      {expanded && (
        <div className="mt-1 break-all rounded bg-red-950/40 p-1.5 font-mono text-[10px] text-red-300">
          {raw}
        </div>
      )}
    </div>
  );
}

interface TransactionModalProps {
  type: 'escrow_deposit' | 'escrow_withdrawal';
  contractId: string;
  asset: string;
  onComplete?: (hash: string) => void;
  onClose: () => void;
}

const errorDecoder = new ErrorDecoder();

export function TransactionModal({
  type,
  contractId,
  asset,
  onComplete,
  onClose,
}: TransactionModalProps) {
  const { metrics } = useWallet();
  const [amount, setAmount] = useState('');
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txError, setTxError] = useState<{ decoded: string; raw: string } | null>(null);

  const isDeposit = type === 'escrow_deposit';

  const estimateGas = async () => {
    if (!amount || !metrics?.publicKey) return;
    setEstimating(true);
    try {
      const response = await fetch('/api/escrow/estimate-gas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          amount,
          asset,
          publicKey: metrics.publicKey,
          operation: type,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setGasEstimate(data.estimatedFee as string);
      }
    } catch {
      setGasEstimate('Unknown');
    } finally {
      setEstimating(false);
    }
  };

  const handleSubmit = async () => {
    if (!amount || !metrics?.publicKey) return;
    setSubmitting(true);
    setTxError(null);
    try {
      const response = await fetch(`/api/escrow/${isDeposit ? 'deposit' : 'withdraw'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId,
          amount,
          asset,
          publicKey: metrics.publicKey,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        onComplete?.(data.hash as string);
      } else {
        const errData = await response.json().catch(() => ({}));
        const raw = (errData.error as string) ?? response.statusText;
        setTxError({ decoded: errorDecoder.tryDecode(raw), raw });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unknown error';
      setTxError({ decoded: errorDecoder.tryDecode(raw), raw });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-6">
        <h3 className="text-lg font-semibold text-white">
          {isDeposit ? 'Deposit to Escrow' : 'Withdraw from Escrow'}
        </h3>
        <p className="mt-1 text-xs text-gray-400">Contract: {contractId.slice(0, 16)}...</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-400">Amount ({asset})</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-white placeholder-gray-500"
            />
          </div>

          <button
            onClick={estimateGas}
            disabled={!amount || estimating}
            className="w-full rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-50"
          >
            {estimating ? 'Estimating...' : 'Estimate Gas Fee'}
          </button>

          {gasEstimate && (
            <div className="rounded bg-gray-800 p-2 text-xs text-gray-400">
              Estimated fee:{' '}
              <span className="font-mono text-green-400">{formatCurrency(gasEstimate)} XLM</span>
            </div>
          )}
        </div>

        {txError && <ErrorBanner decoded={txError.decoded} raw={txError.raw} />}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!amount || submitting}
            className="flex-1 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : isDeposit ? 'Deposit' : 'Withdraw'}
          </button>
        </div>
      </div>
    </div>
  );
}
