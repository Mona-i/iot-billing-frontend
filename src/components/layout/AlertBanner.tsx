'use client';

/**
 * AlertBanner
 *
 * Global alert banner that sits at the top of every page.
 * Integrates the doppelganger detection alert subsystem and renders
 * the DoppelgangerAlertPanel when active alerts exist.
 *
 * Usage: render once inside the root layout, outside the main page content.
 */

import { DoppelgangerAlertPanel } from '@/components/alerts/DoppelgangerAlertPanel';
import type {
  DoppelgangerAlert,
  MaintenanceWindow,
  UseDoppelgangerDetectionOptions,
} from '@/hooks/useDoppelgangerDetection';

export interface AlertBannerProps {
  /** Active doppelganger alerts to display */
  doppelgangerAlerts: DoppelgangerAlert[];
  /** Whether a doppelganger scan is currently running */
  isDoppelgangerScanning: boolean;
  /** Callback to acknowledge a specific alert by ID */
  onAcknowledge: (alertId: string) => void;
  /** Callback to suppress a specific alert for 24 h */
  onSuppress: (alertId: string) => void;
}

export type { DoppelgangerAlert, MaintenanceWindow, UseDoppelgangerDetectionOptions };

export function AlertBanner({
  doppelgangerAlerts,
  isDoppelgangerScanning,
  onAcknowledge,
  onSuppress,
}: AlertBannerProps) {
  const hasVisibleAlerts =
    doppelgangerAlerts.length > 0 || isDoppelgangerScanning;

  if (!hasVisibleAlerts) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full bg-gray-950 px-4 py-3 border-b border-red-900/40"
    >
      <div className="mx-auto max-w-5xl">
        <DoppelgangerAlertPanel
          alerts={doppelgangerAlerts}
          onAcknowledge={onAcknowledge}
          onSuppress={onSuppress}
          isScanning={isDoppelgangerScanning}
        />
      </div>
    </div>
  );
}
