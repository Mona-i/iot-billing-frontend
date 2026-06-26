'use client';

/**
 * DoppelgangerAlertPanel
 *
 * Renders a list of active doppelganger alerts with:
 *  - Confidence score bar (colour-coded)
 *  - Affected validator key (truncated pubkey + optional label)
 *  - Detected foreign peer IDs
 *  - "Acknowledge" and "Suppress" action buttons
 */

import type { DoppelgangerAlert } from '@/hooks/useDoppelgangerDetection';

interface DoppelgangerAlertPanelProps {
  alerts: DoppelgangerAlert[];
  onAcknowledge: (alertId: string) => void;
  onSuppress: (alertId: string) => void;
  /** Optional: show a scanning indicator in the panel header */
  isScanning?: boolean;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);

  let barColor = 'bg-yellow-500';
  if (score >= 0.85) barColor = 'bg-red-500';
  else if (score >= 0.7) barColor = 'bg-orange-500';

  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Confidence score: ${pct}%`}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-gray-300">{pct}%</span>
    </div>
  );
}

function AlertCard({
  alert,
  onAcknowledge,
  onSuppress,
}: {
  alert: DoppelgangerAlert;
  onAcknowledge: () => void;
  onSuppress: () => void;
}) {
  const { result, acknowledgedAt } = alert;
  const pubkeyShort = `${result.pubkey.slice(0, 10)}…${result.pubkey.slice(-6)}`;
  const isAcknowledged = acknowledgedAt !== undefined;

  return (
    <article
      className={`rounded-lg border p-4 ${
        isAcknowledged
          ? 'border-gray-600 bg-gray-800/40'
          : 'border-red-700/60 bg-red-950/30'
      }`}
      aria-label={`Doppelganger alert for validator ${pubkeyShort}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${isAcknowledged ? 'bg-gray-400' : 'animate-pulse bg-red-400'}`}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-red-300">
              {isAcknowledged ? 'Acknowledged' : 'Doppelganger Detected'}
            </span>
          </div>
          {result.label && (
            <p className="mt-0.5 truncate text-xs text-gray-400">{result.label}</p>
          )}
        </div>
        <span className="shrink-0 rounded bg-red-900/40 px-2 py-0.5 font-mono text-[10px] text-red-300">
          {new Date(result.detectedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* Validator pubkey */}
      <div className="mt-3">
        <p className="text-xs text-gray-500">Validator Key</p>
        <p className="mt-0.5 font-mono text-xs text-gray-200 break-all">{pubkeyShort}</p>
      </div>

      {/* Confidence score */}
      <div className="mt-3">
        <p className="text-xs text-gray-500">Confidence Score</p>
        <ConfidenceBar score={result.confidenceScore} />
      </div>

      {/* Foreign peer IDs */}
      {result.unrecognisedPeerIds.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500">
            Detected Foreign Peer{result.unrecognisedPeerIds.length > 1 ? 's' : ''}
          </p>
          <ul className="mt-1 space-y-1">
            {result.unrecognisedPeerIds.map((peerId) => (
              <li key={peerId} className="font-mono text-[11px] text-orange-300 break-all">
                {peerId}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
        <span>Slots checked: {result.slotsChecked}</span>
        <span>Expected node slots: {result.expectedNodeSlots}</span>
        <span>Foreign slots: {result.foreignSlots}</span>
      </div>

      {/* Action buttons */}
      {!isAcknowledged && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={onAcknowledge}
            className="flex-1 rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            Acknowledge
          </button>
          <button
            onClick={onSuppress}
            className="flex-1 rounded bg-red-900/50 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Suppress 24 h
          </button>
        </div>
      )}
    </article>
  );
}

export function DoppelgangerAlertPanel({
  alerts,
  onAcknowledge,
  onSuppress,
  isScanning = false,
}: DoppelgangerAlertPanelProps) {
  const unacknowledged = alerts.filter((a) => !a.acknowledgedAt);
  const acknowledged = alerts.filter((a) => a.acknowledgedAt !== undefined);

  if (alerts.length === 0 && !isScanning) {
    return null;
  }

  return (
    <section
      aria-label="Doppelganger alert panel"
      className="rounded-xl border border-red-800/50 bg-gray-900/80 p-4 shadow-lg"
    >
      {/* Panel header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-red-300">⚠ Doppelganger Alerts</span>
          {unacknowledged.length > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {unacknowledged.length}
            </span>
          )}
        </div>
        {isScanning && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
            Scanning…
          </div>
        )}
      </div>

      {/* Empty state while scanning */}
      {alerts.length === 0 && isScanning && (
        <p className="text-center text-xs text-gray-500">Scanning validator keys…</p>
      )}

      {/* Active (unacknowledged) alerts */}
      {unacknowledged.length > 0 && (
        <div className="space-y-3">
          {unacknowledged.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={() => onAcknowledge(alert.id)}
              onSuppress={() => onSuppress(alert.id)}
            />
          ))}
        </div>
      )}

      {/* Acknowledged alerts */}
      {acknowledged.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-600">
            Acknowledged
          </p>
          <div className="space-y-2">
            {acknowledged.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={() => onAcknowledge(alert.id)}
                onSuppress={() => onSuppress(alert.id)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
