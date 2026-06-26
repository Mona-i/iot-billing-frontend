import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildDedupKey,
  isDuplicate,
  markAlerted,
  clearDedupKey,
  clearAllDedupEntries,
} from './alertDeduplicator';

// Provide a minimal localStorage mock in jsdom (already provided by jsdom, but
// we need explicit setup because vitest resets globals between runs)
describe('alertDeduplicator', () => {
  beforeEach(() => {
    clearAllDedupEntries();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAllDedupEntries();
  });

  describe('buildDedupKey', () => {
    it('builds a deterministic key from pubkey and peers', () => {
      const key = buildDedupKey('0xabc', ['peer-b', 'peer-a']);
      expect(key).toBe('0xabc::peer-a,peer-b');
    });

    it('sorts peer IDs to ensure order-independence', () => {
      const k1 = buildDedupKey('0xabc', ['z', 'a', 'm']);
      const k2 = buildDedupKey('0xabc', ['m', 'z', 'a']);
      expect(k1).toBe(k2);
    });

    it('handles empty peer list', () => {
      const key = buildDedupKey('0xabc', []);
      expect(key).toBe('0xabc::');
    });
  });

  describe('isDuplicate / markAlerted', () => {
    it('returns false for an unseen key', () => {
      expect(isDuplicate('some-key')).toBe(false);
    });

    it('returns true after markAlerted is called', () => {
      markAlerted('some-key');
      expect(isDuplicate('some-key')).toBe(true);
    });

    it('returns false after the 24 h window expires', () => {
      markAlerted('expiry-key');
      // Advance time by 25 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(isDuplicate('expiry-key')).toBe(false);
    });

    it('refreshes expiry when markAlerted is called again', () => {
      markAlerted('refresh-key');
      // Advance 12 hours — still within window
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);
      markAlerted('refresh-key'); // refresh
      // Advance another 13 hours (total 25 h from first mark, but only 13 h from refresh)
      vi.advanceTimersByTime(13 * 60 * 60 * 1000);
      expect(isDuplicate('refresh-key')).toBe(true);
    });

    it('does not interfere with other keys', () => {
      markAlerted('key-a');
      expect(isDuplicate('key-b')).toBe(false);
    });
  });

  describe('clearDedupKey', () => {
    it('removes a key from the store', () => {
      markAlerted('remove-me');
      clearDedupKey('remove-me');
      expect(isDuplicate('remove-me')).toBe(false);
    });

    it('is a no-op for keys not in the store', () => {
      expect(() => clearDedupKey('ghost-key')).not.toThrow();
    });
  });

  describe('clearAllDedupEntries', () => {
    it('removes all tracked keys', () => {
      markAlerted('key-1');
      markAlerted('key-2');
      clearAllDedupEntries();
      expect(isDuplicate('key-1')).toBe(false);
      expect(isDuplicate('key-2')).toBe(false);
    });
  });
});
