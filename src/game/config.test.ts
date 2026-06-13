import { describe, it, expect } from 'vitest';
import { rollAlarmReaction, type AlarmReaction } from './config.ts';

// rollAlarmReaction is the weighted alarm-reaction pick. It takes the roll
// (0..1) as a parameter so it's pure and deterministic to test, independent
// of the shipped ALARM_REACTION_WEIGHTS (which are currently 100% storm for
// playtest). Contract: rand*total < lookAtTable weight → lookAtTable, else
// storm; a zero-sum weights object degrades to storm rather than throwing.

describe('rollAlarmReaction', () => {
    it('splits a 70/30 look/storm weighting at the boundary', () => {
        const w: Record<AlarmReaction, number> = { lookAtTable: 0.7, storm: 0.3 };
        // rand * 1.0 < 0.7 → lookAtTable
        expect(rollAlarmReaction(w, 0.0)).toBe('lookAtTable');
        expect(rollAlarmReaction(w, 0.69)).toBe('lookAtTable');
        // >= 0.7 → storm
        expect(rollAlarmReaction(w, 0.7)).toBe('storm');
        expect(rollAlarmReaction(w, 0.99)).toBe('storm');
    });

    it('always returns storm at 100% storm weighting', () => {
        const w: Record<AlarmReaction, number> = { lookAtTable: 0, storm: 1 };
        expect(rollAlarmReaction(w, 0)).toBe('storm');
        expect(rollAlarmReaction(w, 0.5)).toBe('storm');
        expect(rollAlarmReaction(w, 0.999)).toBe('storm');
    });

    it('always returns lookAtTable at 100% look weighting', () => {
        const w: Record<AlarmReaction, number> = { lookAtTable: 1, storm: 0 };
        expect(rollAlarmReaction(w, 0)).toBe('lookAtTable');
        expect(rollAlarmReaction(w, 0.999)).toBe('lookAtTable');
    });

    it('degrades to storm (no throw / NaN) when weights sum to zero', () => {
        const w: Record<AlarmReaction, number> = { lookAtTable: 0, storm: 0 };
        // rand * 0 = 0, which is not < 0 → storm
        expect(rollAlarmReaction(w, 0.5)).toBe('storm');
    });

    it('handles non-normalized weights (uses the total, not a literal 0..1)', () => {
        const w: Record<AlarmReaction, number> = { lookAtTable: 7, storm: 3 };
        // rand * 10 < 7 → lookAtTable
        expect(rollAlarmReaction(w, 0.69)).toBe('lookAtTable'); // 6.9 < 7
        expect(rollAlarmReaction(w, 0.71)).toBe('storm');       // 7.1 >= 7
    });
});
