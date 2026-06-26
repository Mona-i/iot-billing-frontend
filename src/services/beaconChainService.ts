/**
 * Beacon chain service.
 *
 * Provides methods for querying attestation data and peer-ID maps
 * from a configurable beacon node REST API.
 */

import type { AttestationRecord } from '@/utils/doppelgangerDetector';

const BEACON_API_BASE =
  process.env.NEXT_PUBLIC_BEACON_API_URL ?? 'http://localhost:5052';

/** Raw shape of a single attestation returned by the beacon API */
interface BeaconAttestationDto {
  slot: string;
  epoch: string;
  signing_peer_id: string;
  source_ip?: string;
}

/** Raw shape of a single peer from the beacon API */
interface BeaconPeerDto {
  peer_id: string;
  validator_pubkey?: string;
  state: string;
}

/**
 * Fetches the current peer-ID map from the beacon node.
 * Returns a map from validator pubkey → peer ID.
 */
export async function fetchPeerIdMap(signal?: AbortSignal): Promise<Map<string, string>> {
  const url = `${BEACON_API_BASE}/eth/v1/node/peers`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Beacon peer query failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as { data: BeaconPeerDto[] };
  const map = new Map<string, string>();
  for (const peer of body.data) {
    if (peer.validator_pubkey) {
      map.set(peer.validator_pubkey, peer.peer_id);
    }
  }
  return map;
}

/**
 * Fetches recent attestation records for a given validator pubkey over the
 * specified epoch window.
 *
 * @param pubkey     Validator BLS public key
 * @param fromEpoch  Start epoch (inclusive)
 * @param toEpoch    End epoch (inclusive)
 * @param signal     Optional AbortSignal
 */
export async function fetchAttestationRecords(
  pubkey: string,
  fromEpoch: number,
  toEpoch: number,
  signal?: AbortSignal,
): Promise<AttestationRecord[]> {
  const params = new URLSearchParams({
    pubkey,
    from_epoch: String(fromEpoch),
    to_epoch: String(toEpoch),
  });
  const url = `${BEACON_API_BASE}/eth/v1/validator/attestation_data?${params}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Beacon attestation query failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as { data: BeaconAttestationDto[] };
  return body.data.map((dto) => ({
    slot: Number(dto.slot),
    epoch: Number(dto.epoch),
    signingPeerId: dto.signing_peer_id,
    sourceIp: dto.source_ip,
  }));
}

/**
 * Returns the current head epoch from the beacon node.
 */
export async function fetchCurrentEpoch(signal?: AbortSignal): Promise<number> {
  const url = `${BEACON_API_BASE}/eth/v1/beacon/states/head/finality_checkpoints`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Beacon finality checkpoint query failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as {
    data: { current_justified: { epoch: string } };
  };
  return Number(body.data.current_justified.epoch);
}
