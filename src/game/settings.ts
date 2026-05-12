// Game settings: persisted via localStorage under a single namespaced key.
//
// Schema is intentionally flat — adding a new field means appending to the
// interface + DEFAULTS, and loadSettings's spread-merge handles old saves
// gracefully (missing fields get DEFAULTS values).
//
// All settings live here; the Settings scene mutates and saves them, and
// gameplay code reads them lazily per-scene (no central cache, no Boot
// trigger needed — localStorage reads are cheap and synchronous).

export interface GameSettings {
    musicVolume: number;              // 0.0 to 1.0
    sfxVolume: number;                // 0.0 to 1.0
    muted: boolean;                   // master mute; overrides both volumes to 0
    lootTargetOverride: number | null;  // null = use LEVELS[i].lootTarget
}

const SETTINGS_KEY = 'slick_hand_joe:settings';

const DEFAULTS: GameSettings = {
    musicVolume: 1.0,
    sfxVolume: 1.0,
    muted: false,
    lootTargetOverride: null,
};

export function loadSettings(): GameSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw) as Partial<GameSettings>;
        // Spread-merge with defaults so old saves missing newer fields don't
        // crash; new fields just take their default values.
        return { ...DEFAULTS, ...parsed };
    } catch {
        // Malformed JSON, localStorage disabled, etc. Silent fallback.
        return { ...DEFAULTS };
    }
}

export function saveSettings(s: GameSettings): void {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
        // localStorage may be unavailable (private browsing, quota exceeded).
        // The session works in-memory; settings just don't persist past reload.
    }
}

// Compute the effective volume for an audio channel, accounting for mute.
// When muted, returns 0 regardless of slider value — the per-channel volumes
// stay tuned in the player's preference; mute just overrides at the
// application layer. Music and SFX call sites both read through this so
// the mute logic lives in one place.
export function effectiveVolume(
    s: GameSettings,
    channel: 'music' | 'sfx',
): number {
    if (s.muted) return 0;
    return channel === 'music' ? s.musicVolume : s.sfxVolume;
}
