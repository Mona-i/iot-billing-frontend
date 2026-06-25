/**
 * Doppelganger Scanner Web Worker
 *
 * Receives batches of up to 1,000 validator keys and their attestation
 * records, runs doppelganger evaluation on each key, and posts results
 * back to the main thread using transferable ArrayBuffers (zero-copy).
 *
 * Message protocol (main → worker):
 *   { type: 'scan', batchId: string, keys: ScanKeyPayload[] }
 *
 * Message protocol (worker → main):
 *   { type: 'scanResult', batchId: string, results: DoppelgangerResult[] }
 *   { type: 'scanError',  batchId: string, error: string }
 */

import {
  evaluateDoppelganger,
  type ValidatorKeyConfig,
  type AttestationRecord,
  type DoppelgangerResult,
} from '@/utils/doppelgangerDetector';

/** Maximum keys processed per batch — matches issue specification */
export const BATCH_SIZE = 1_000;

export interface ScanKeyPayload {
  pubkey: string;
  expectedNodeId: string;
  label?: string;
  attestationRecords: AttestationRecord[];
}

interface ScanMessage {
  type: 'scan';
  batchId: string;
  keys: ScanKeyPayload[];
}

interface ScanResultMessage {
  type: 'scanResult';
  batchId: string;
  results: DoppelgangerResult[];
}

interface ScanErrorMessage {
  type: 'scanError';
  batchId: string;
  error: string;
}

type WorkerOutMessage = ScanResultMessage | ScanErrorMessage;

self.onmessage = (event: MessageEvent<ScanMessage>) => {
  const { type, batchId, keys } = event.data;

  if (type !== 'scan') return;

  try {
    const batchKeys = keys.slice(0, BATCH_SIZE);
    const results: DoppelgangerResult[] = [];

    for (const payload of batchKeys) {
      const config: ValidatorKeyConfig = {
        pubkey: payload.pubkey,
        expectedNodeId: payload.expectedNodeId,
        label: payload.label,
      };
      results.push(evaluateDoppelganger(config, payload.attestationRecords));
    }

    // Serialise results to JSON, encode to UTF-8, transfer as ArrayBuffer (zero-copy)
    const jsonStr = JSON.stringify(results);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(jsonStr);
    // Create a copy in a transferable ArrayBuffer
    const buffer = encoded.buffer.slice(0) as ArrayBuffer;

    const outMsg: WorkerOutMessage = {
      type: 'scanResult',
      batchId,
      results,
    };

    // Post with transferable buffer (zero-copy byte-stream)
    self.postMessage(outMsg, [buffer]);
  } catch (err) {
    const errMsg: WorkerOutMessage = {
      type: 'scanError',
      batchId,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errMsg);
  }
};
