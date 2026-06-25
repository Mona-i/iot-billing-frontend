import { describe, it, expect } from 'vitest';
import {
  computeConfidenceScore,
  evaluateDoppelganger,
  DOPPELGANGER_CONFIDENCE_THRESHOLD,
  SLOTS_PER_EPOCH,
  DETECTION_EPOCH_WINDOW,
} from './doppelgangerDetector';
import type { AttestationRecord, ValidatorKeyConfig } from './doppelgangerDetector';

const TOTAL_SLOTS = SLOTS_PER_EPOCH * DETECTION_EPOCH_WINDOW; // 64

function makeRecords(
  signingPeerId: string,
  count: number,
  slotOffset = 0,
): AttestationRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    slot: slotOffset + i,
    epoch: Math.floor((slotOffset + i) / SLOTS_PER_EPOCH),
    signingPeerId,
  }));
}

describe('computeConfidenceScore', () => {
  it('returns zero score for empty records', () => {
    const result = computeConfidenceScore([], 'expected-node');
    expect(result.confidenceScore).toBe(0);
    expect(result.unrecognisedPeerIds).toEqual([]);
    expect(result.slotsChecked).toBe(0);
  });

  it('returns low score when only the expected node is signing', () => {
    const records = makeRecords('expected-node', TOTAL_SLOTS);
    const result = computeConfidenceScore(records, 'expected-node');

    // No unrecognised peers → term1 = 0
    expect(result.unrecognisedPeerIds).toEqual([]);
    // Expected node covered all slots → dutyMissRate ≈ 0
    expect(result.confidenceScore).toBeCloseTo(0, 1);
  });

  it('returns high score when only unrecognised peers are signing', () => {
    const records = makeRecords('foreign-node', TOTAL_SLOTS);
    const result = computeConfidenceScore(records, 'expected-node');

    // All peers are unrecognised → term1 = 1
    expect(result.unrecognisedPeerIds).toContain('foreign-node');
    // Expected node never seen → dutyMissRate = 1 → term2 = 0.4
    // total = 0.6*1 + 0.4*1 = 1.0
    expect(result.confidenceScore).toBeCloseTo(1.0, 2);
  });

  it('returns a mixed score with partial foreign activity', () => {
    // 32 slots from expected node + 32 slots from foreign node
    const expected = makeRecords('expected-node', 32, 0);
    const foreign = makeRecords('foreign-node', 32, 32);
    const records = [...expected, ...foreign];

    const result = computeConfidenceScore(records, 'expected-node');

    // 1 unrecognised peer out of 2 total → term1 fraction = 0.5 → 0.6*0.5 = 0.3
    // expectedNodeSlots = 32, totalSlots = 64 → dutyMissRate = 1 - 32/64 = 0.5 → 0.4*0.5 = 0.2
    // score = 0.3 + 0.2 = 0.5
    expect(result.confidenceScore).toBeCloseTo(0.5, 1);
    expect(result.unrecognisedPeerIds).toContain('foreign-node');
    expect(result.expectedNodeSlots).toBe(32);
    expect(result.foreignSlots).toBe(32);
  });

  it('caps confidence score at 1.0', () => {
    // Many foreign nodes, none of them is the expected node
    const records = [
      ...makeRecords('foreign-a', 20, 0),
      ...makeRecords('foreign-b', 20, 20),
      ...makeRecords('foreign-c', 24, 40),
    ];
    const result = computeConfidenceScore(records, 'expected-node');
    expect(result.confidenceScore).toBeLessThanOrEqual(1.0);
  });

  it('identifies multiple distinct unrecognised peer IDs', () => {
    const records = [
      ...makeRecords('foreign-a', 10, 0),
      ...makeRecords('foreign-b', 10, 10),
      ...makeRecords('expected-node', 10, 20),
    ];
    const result = computeConfidenceScore(records, 'expected-node');
    expect(result.unrecognisedPeerIds).toContain('foreign-a');
    expect(result.unrecognisedPeerIds).toContain('foreign-b');
    expect(result.unrecognisedPeerIds).not.toContain('expected-node');
  });
});

describe('evaluateDoppelganger', () => {
  const config: ValidatorKeyConfig = {
    pubkey: '0xabc123',
    expectedNodeId: 'expected-node',
    label: 'My Validator',
  };

  it('flags isDoppelganger=true when confidence >= threshold', () => {
    const records = makeRecords('foreign-node', TOTAL_SLOTS);
    const result = evaluateDoppelganger(config, records);

    expect(result.isDoppelganger).toBe(true);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(DOPPELGANGER_CONFIDENCE_THRESHOLD);
    expect(result.pubkey).toBe('0xabc123');
    expect(result.expectedNodeId).toBe('expected-node');
    expect(result.label).toBe('My Validator');
  });

  it('flags isDoppelganger=false when confidence < threshold', () => {
    const records = makeRecords('expected-node', TOTAL_SLOTS);
    const result = evaluateDoppelganger(config, records);

    expect(result.isDoppelganger).toBe(false);
    expect(result.confidenceScore).toBeLessThan(DOPPELGANGER_CONFIDENCE_THRESHOLD);
  });

  it('includes detectedAt timestamp', () => {
    const before = Date.now();
    const result = evaluateDoppelganger(config, []);
    const after = Date.now();

    expect(result.detectedAt).toBeGreaterThanOrEqual(before);
    expect(result.detectedAt).toBeLessThanOrEqual(after);
  });

  it('handles undefined label gracefully', () => {
    const noLabel: ValidatorKeyConfig = { pubkey: '0xdef', expectedNodeId: 'n1' };
    const result = evaluateDoppelganger(noLabel, []);
    expect(result.label).toBeUndefined();
  });
});

describe('DOPPELGANGER_CONFIDENCE_THRESHOLD', () => {
  it('is 0.6', () => {
    expect(DOPPELGANGER_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});
