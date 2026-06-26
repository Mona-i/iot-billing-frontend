/**
 * Core doppelganger detection logic.
 *
 * For each validator key, queries recent attestation slots across the last 2 epochs
 * (≈12.8 min), compares observed signing peer IDs against the expected node,
 * and computes a confidence score:
 *
 *   score = 0.6 × (unrecognised_peer_ids_count / total_observed_peers)
 *         + 0.4 × (duty_slot_miss_rate_on_expected_node)
 */

export interface ValidatorKeyConfig {
  /** BLS public key (hex or base64) identifying the validator */
  pubkey: string;
  /** Expected peer/node ID that should be signing for this key */
  expectedNodeId: string;
  /** Optional human-readable label */
  label?: string;
}

export interface AttestationRecord {
  slot: number;
  epoch: number;
  signingPeerId: string;
  sourceIp?: string;
}

export interface DoppelgangerResult {
  pubkey: string;
  expectedNodeId: string;
  label?: string;
  isDoppelganger: boolean;
  confidenceScore: number;
  /** Peer IDs observed signing that are NOT the expected node */
  unrecognisedPeerIds: string[];
  /** Total slots checked in the detection window */
  slotsChecked: number;
  /** Slots where the expected node was present */
  expectedNodeSlots: number;
  /** Slots where an unrecognised peer was present */
  foreignSlots: number;
  detectedAt: number;
}

/**
 * Confidence threshold above which a doppelganger alert is raised.
 * Any score >= 0.6 is treated as a detection.
 */
export const DOPPELGANGER_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Slots per epoch on the consensus layer (Ethereum mainnet: 32 slots/epoch).
 * We monitor 2 epochs → 64 slots.
 */
export const SLOTS_PER_EPOCH = 32;
export const DETECTION_EPOCH_WINDOW = 2;

/**
 * Computes the doppelganger confidence score given raw attestation records.
 *
 * @param records   Attestation records observed for this key in the window
 * @param expectedNodeId  The node ID we expect to be the sole signer
 * @returns Partial result containing the score breakdown
 */
export function computeConfidenceScore(
  records: AttestationRecord[],
  expectedNodeId: string,
): {
  confidenceScore: number;
  unrecognisedPeerIds: string[];
  expectedNodeSlots: number;
  foreignSlots: number;
  slotsChecked: number;
} {
  if (records.length === 0) {
    return {
      confidenceScore: 0,
      unrecognisedPeerIds: [],
      expectedNodeSlots: 0,
      foreignSlots: 0,
      slotsChecked: 0,
    };
  }

  const totalSlots = SLOTS_PER_EPOCH * DETECTION_EPOCH_WINDOW;

  // Collect all unique peer IDs and counts per peer
  const peerSlotCounts = new Map<string, number>();
  for (const r of records) {
    peerSlotCounts.set(r.signingPeerId, (peerSlotCounts.get(r.signingPeerId) ?? 0) + 1);
  }

  const expectedNodeSlots = peerSlotCounts.get(expectedNodeId) ?? 0;

  // All peer IDs that are NOT the expected node
  const unrecognisedPeerIds: string[] = [];
  let foreignSlots = 0;
  for (const [peerId, count] of peerSlotCounts.entries()) {
    if (peerId !== expectedNodeId) {
      unrecognisedPeerIds.push(peerId);
      foreignSlots += count;
    }
  }

  // Term 1: fraction of unique unrecognised peers relative to total distinct peers observed
  const totalDistinctPeers = peerSlotCounts.size;
  const unrecognisedPeerFraction =
    totalDistinctPeers > 0 ? unrecognisedPeerIds.length / totalDistinctPeers : 0;

  // Term 2: duty-slot miss rate on expected node
  // = 1 - (slots where expected node was seen / total slots in window)
  const dutyMissRate = 1 - Math.min(1, expectedNodeSlots / totalSlots);

  const confidenceScore = Math.min(1, 0.6 * unrecognisedPeerFraction + 0.4 * dutyMissRate);

  return {
    confidenceScore,
    unrecognisedPeerIds,
    expectedNodeSlots,
    foreignSlots,
    slotsChecked: records.length,
  };
}

/**
 * Evaluates a single validator key against its attestation records.
 */
export function evaluateDoppelganger(
  config: ValidatorKeyConfig,
  records: AttestationRecord[],
): DoppelgangerResult {
  const { pubkey, expectedNodeId, label } = config;

  const {
    confidenceScore,
    unrecognisedPeerIds,
    expectedNodeSlots,
    foreignSlots,
    slotsChecked,
  } = computeConfidenceScore(records, expectedNodeId);

  return {
    pubkey,
    expectedNodeId,
    label,
    isDoppelganger: confidenceScore >= DOPPELGANGER_CONFIDENCE_THRESHOLD,
    confidenceScore,
    unrecognisedPeerIds,
    slotsChecked,
    expectedNodeSlots,
    foreignSlots,
    detectedAt: Date.now(),
  };
}
