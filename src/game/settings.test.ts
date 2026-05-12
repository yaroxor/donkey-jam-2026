import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSettings, saveSettings, effectiveVolume } from './settings.ts';

// Regression contract for the settings module. settings.ts is pure TS but it
// sits on a hot path: every SFX play and every MainGame init re-reads it, and
// the Settings scene writes to it on every +/- click. The contracts pinned
// here:
//
//   - DEFAULTS shape: load returns DEFAULTS for empty/missing/malformed input
//   - spread-merge: partial saves don't crash on missing fields after a new
//     field is added to the interface (back-compat across schema changes)
//   - round-trip: save then load returns the same shape (modulo defaults)
//   - effectiveVolume gates correctly on the master mute and routes by channel
//
// localStorage is stubbed per test via vi.stubGlobal so each case starts from
// a clean slate. The stub stores values in an in-memory Map and supports
// throwing on setItem (to exercise the quota-exceeded catch path).

interface LocalStorageStub {
    store: Map<string, string>;
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
}

function stubLocalStorage(): LocalStorageStub {
    const store = new Map<string, string>();
    const stub: LocalStorageStub = {
        store,
        getItem: vi.fn((key: string): string | null => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string): void => {
            store.set(key, value);
        }),
    };
    vi.stubGlobal('localStorage', stub);
    return stub;
}

const DEFAULT_SHAPE = {
    musicVolume: 1.0,
    sfxVolume: 1.0,
    muted: false,
    lootTargetOverride: null,
    timerOverride: null,
};

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe('loadSettings', () => {
    it('returns DEFAULTS when localStorage has no entry', () => {
        stubLocalStorage();

        expect(loadSettings()).toEqual(DEFAULT_SHAPE);
    });

    it('returns the persisted values when localStorage has a complete entry', () => {
        const ls = stubLocalStorage();
        ls.store.set('slick_hand_joe:settings', JSON.stringify({
            musicVolume: 0.4,
            sfxVolume: 0.7,
            muted: true,
            lootTargetOverride: 10,
            timerOverride: 90,
        }));

        expect(loadSettings()).toEqual({
            musicVolume: 0.4,
            sfxVolume: 0.7,
            muted: true,
            lootTargetOverride: 10,
            timerOverride: 90,
        });
    });

    it('spread-merges partial saves so missing fields take DEFAULTS values', () => {
        // Simulates an old save predating a newer field — the back-compat
        // contract is that adding a field to the interface + DEFAULTS is
        // safe; old saves keep working.
        const ls = stubLocalStorage();
        ls.store.set('slick_hand_joe:settings', JSON.stringify({
            musicVolume: 0.3,
            muted: true,
        }));

        const s = loadSettings();
        expect(s.musicVolume).toBe(0.3);
        expect(s.muted).toBe(true);
        // Fields missing from the persisted JSON fall through to defaults.
        expect(s.sfxVolume).toBe(1.0);
        expect(s.lootTargetOverride).toBeNull();
        expect(s.timerOverride).toBeNull();
    });

    it('returns DEFAULTS when the persisted JSON is malformed', () => {
        const ls = stubLocalStorage();
        ls.store.set('slick_hand_joe:settings', '{not valid json');

        expect(loadSettings()).toEqual(DEFAULT_SHAPE);
    });

    it('returns DEFAULTS when localStorage access throws', () => {
        // Private browsing / disabled storage / quota-exceeded all surface
        // as getItem throwing. The silent-fallback branch should catch it
        // and return defaults rather than crashing the game on boot.
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((): string => {
                throw new Error('localStorage disabled');
            }),
            setItem: vi.fn(),
        });

        expect(loadSettings()).toEqual(DEFAULT_SHAPE);
    });
});

describe('saveSettings', () => {
    it('writes the serialized settings to the namespaced key', () => {
        const ls = stubLocalStorage();

        saveSettings({
            musicVolume: 0.5,
            sfxVolume: 0.5,
            muted: false,
            lootTargetOverride: 7,
            timerOverride: 45,
        });

        expect(ls.setItem).toHaveBeenCalledWith(
            'slick_hand_joe:settings',
            JSON.stringify({
                musicVolume: 0.5,
                sfxVolume: 0.5,
                muted: false,
                lootTargetOverride: 7,
                timerOverride: 45,
            }),
        );
    });

    it('silently swallows storage errors so the game keeps running', () => {
        // Quota exceeded, private mode, etc. The session works in-memory
        // and the next load() falls back to defaults — no crash.
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(),
            setItem: vi.fn((): void => {
                throw new Error('QuotaExceededError');
            }),
        });

        expect(() => saveSettings(DEFAULT_SHAPE)).not.toThrow();
    });

    it('round-trips through loadSettings', () => {
        stubLocalStorage();
        const original = {
            musicVolume: 0.8,
            sfxVolume: 0.2,
            muted: true,
            lootTargetOverride: 3,
            timerOverride: 30,
        };

        saveSettings(original);

        expect(loadSettings()).toEqual(original);
    });
});

describe('effectiveVolume', () => {
    it('returns the music volume when unmuted and channel is music', () => {
        const s = { ...DEFAULT_SHAPE, musicVolume: 0.6, sfxVolume: 0.4, muted: false };

        expect(effectiveVolume(s, 'music')).toBe(0.6);
    });

    it('returns the sfx volume when unmuted and channel is sfx', () => {
        const s = { ...DEFAULT_SHAPE, musicVolume: 0.6, sfxVolume: 0.4, muted: false };

        expect(effectiveVolume(s, 'sfx')).toBe(0.4);
    });

    it('returns 0 for the music channel when muted regardless of slider', () => {
        const s = { ...DEFAULT_SHAPE, musicVolume: 0.9, sfxVolume: 0.9, muted: true };

        expect(effectiveVolume(s, 'music')).toBe(0);
    });

    it('returns 0 for the sfx channel when muted regardless of slider', () => {
        const s = { ...DEFAULT_SHAPE, musicVolume: 0.9, sfxVolume: 0.9, muted: true };

        expect(effectiveVolume(s, 'sfx')).toBe(0);
    });
});
