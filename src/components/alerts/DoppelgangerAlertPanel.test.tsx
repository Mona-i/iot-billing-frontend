import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DoppelgangerAlertPanel } from './DoppelgangerAlertPanel';
import type { DoppelgangerAlert } from '@/hooks/useDoppelgangerDetection';

function makeAlert(overrides: Partial<DoppelgangerAlert['result']> = {}): DoppelgangerAlert {
  return {
    id: 'alert-1',
    result: {
      pubkey: '0xabcdef1234567890',
      expectedNodeId: 'node-expected',
      label: 'Test Validator',
      isDoppelganger: true,
      confidenceScore: 0.85,
      unrecognisedPeerIds: ['foreign-peer-1', 'foreign-peer-2'],
      slotsChecked: 64,
      expectedNodeSlots: 10,
      foreignSlots: 54,
      detectedAt: 1_700_000_000_000,
      ...overrides,
    },
  };
}

describe('DoppelgangerAlertPanel', () => {
  it('renders nothing when alerts are empty and not scanning', () => {
    const { container } = render(
      <DoppelgangerAlertPanel
        alerts={[]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
        isScanning={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows scanning indicator when isScanning=true and no alerts', () => {
    render(
      <DoppelgangerAlertPanel
        alerts={[]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
        isScanning={true}
      />,
    );
    expect(screen.getByText(/Scanning/)).toBeDefined();
  });

  it('renders the panel with a doppelganger alert', () => {
    const alert = makeAlert();
    render(
      <DoppelgangerAlertPanel
        alerts={[alert]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
      />,
    );
    expect(screen.getByText('Doppelganger Detected')).toBeDefined();
    expect(screen.getByText('Test Validator')).toBeDefined();
  });

  it('shows the confidence score percentage', () => {
    const alert = makeAlert({ confidenceScore: 0.85 });
    render(
      <DoppelgangerAlertPanel
        alerts={[alert]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
      />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('85');
  });

  it('shows unrecognised peer IDs', () => {
    const alert = makeAlert({ unrecognisedPeerIds: ['foreign-peer-1', 'foreign-peer-2'] });
    render(
      <DoppelgangerAlertPanel
        alerts={[alert]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
      />,
    );
    expect(screen.getByText('foreign-peer-1')).toBeDefined();
    expect(screen.getByText('foreign-peer-2')).toBeDefined();
  });

  it('calls onAcknowledge with correct alert ID', () => {
    const onAcknowledge = vi.fn();
    const alert = makeAlert();
    render(
      <DoppelgangerAlertPanel
        alerts={[alert]}
        onAcknowledge={onAcknowledge}
        onSuppress={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Acknowledge'));
    expect(onAcknowledge).toHaveBeenCalledWith('alert-1');
  });

  it('calls onSuppress with correct alert ID', () => {
    const onSuppress = vi.fn();
    const alert = makeAlert();
    render(
      <DoppelgangerAlertPanel
        alerts={[alert]}
        onAcknowledge={vi.fn()}
        onSuppress={onSuppress}
      />,
    );
    fireEvent.click(screen.getByText('Suppress 24 h'));
    expect(onSuppress).toHaveBeenCalledWith('alert-1');
  });

  it('shows acknowledged state when acknowledgedAt is set', () => {
    const alert: DoppelgangerAlert = {
      ...makeAlert(),
      acknowledgedAt: Date.now(),
    };
    render(
      <DoppelgangerAlertPanel
        alerts={[alert]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
      />,
    );
    expect(screen.getByText('Acknowledged')).toBeDefined();
    // Action buttons should be hidden for acknowledged alerts
    expect(screen.queryByText('Acknowledge')).toBeNull();
    expect(screen.queryByText('Suppress 24 h')).toBeNull();
  });

  it('shows the unacknowledged count badge', () => {
    const alert1 = makeAlert();
    const alert2: DoppelgangerAlert = {
      id: 'alert-2',
      result: { ...makeAlert().result, pubkey: '0xother' },
    };
    render(
      <DoppelgangerAlertPanel
        alerts={[alert1, alert2]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
      />,
    );
    expect(screen.getByText('2')).toBeDefined();
  });

  it('renders without label when label is undefined', () => {
    const alert = makeAlert({ label: undefined });
    render(
      <DoppelgangerAlertPanel
        alerts={[alert]}
        onAcknowledge={vi.fn()}
        onSuppress={vi.fn()}
      />,
    );
    // Panel should still render
    expect(screen.getByText('Doppelganger Detected')).toBeDefined();
  });
});
