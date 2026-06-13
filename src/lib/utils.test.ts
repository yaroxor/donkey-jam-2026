import { describe, it, expect } from 'vitest';
import { shuffle } from './utils.ts';

// Regression contract for the Fisher-Yates shuffle. Locks the *properties*
// of a correct shuffle (same length, same multiset, in-place, no return),
// not specific orderings -- those depend on Math.random and aren't testable
// without seeding.

describe('shuffle', () => {
    it('mutates in place and returns undefined', () => {
        const arr = ['a', 'b', 'c'];
        expect(shuffle(arr)).toBeUndefined();
    });

    it('preserves length', () => {
        const arr = ['a', 'b', 'c', 'd', 'e'];
        shuffle(arr);
        expect(arr).toHaveLength(5);
    });

    it('preserves the multiset of elements (sorted equality)', () => {
        const original = ['a', 'b', 'c', 'd', 'e'];
        const arr = [...original];
        shuffle(arr);
        expect([...arr].sort()).toEqual([...original].sort());
    });

    it('preserves duplicates', () => {
        const arr = ['a', 'a', 'b', 'b', 'c'];
        shuffle(arr);
        expect([...arr].sort()).toEqual(['a', 'a', 'b', 'b', 'c']);
    });

    it('handles empty array without throwing', () => {
        const arr: string[] = [];
        expect(() => shuffle(arr)).not.toThrow();
        expect(arr).toEqual([]);
    });

    it('handles single-element array (identity)', () => {
        const arr = ['only'];
        shuffle(arr);
        expect(arr).toEqual(['only']);
    });

    it('over 100 runs on [0..9], can produce >1 distinct ordering (sanity check on randomness)', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 100; i++) {
            const arr = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            shuffle(arr);
            seen.add(arr.join(','));
        }
        // 10! = 3,628,800 possible orderings. 100 runs producing the same
        // ordering every time would mean shuffle is broken (constant) or
        // Math.random has been mocked to a constant. Threshold is loose
        // (>=2) to avoid astronomically-rare false positives.
        expect(seen.size).toBeGreaterThan(1);
    });
});
