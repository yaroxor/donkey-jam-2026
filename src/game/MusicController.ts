import { Scene } from 'phaser';

type GameSound = Phaser.Sound.HTML5AudioSound | Phaser.Sound.WebAudioSound;

// Single source of truth for all music tracks in a scene. Invariant: at most
// one track plays at any time. Adding a new track is one register() call;
// stopAll() and play() handle "stop every other one" structurally, so the
// invariant doesn't depend on remembering each track at every call site.
export class MusicController {
    private tracks: Record<string, GameSound> = {};
    private current: string | null = null;

    constructor(private readonly scene: Scene) {}

    // Idempotent across scene restarts. The SoundManager is game-scoped, so
    // re-registering via a fresh `sound.add` would leak duplicate instances
    // every time the scene restarts. Reuse the existing instance if there
    // already is one in the SoundManager for this key.
    register(key: string, config: Phaser.Types.Sound.SoundConfig = {}): void {
        if (this.tracks[key]) return;
        const existing = this.scene.sound.getAll(key)[0];
        this.tracks[key] = (existing ?? this.scene.sound.add(key, config)) as GameSound;
    }

    // Stop every other registered track, then play this one from the start.
    play(key: string): void {
        this.assertExists(key);
        for (const [k, t] of Object.entries(this.tracks)) {
            if (k !== key) t.stop();
        }
        this.tracks[key].play();
        this.current = key;
    }

    // Wait until the next beat boundary, then swap tracks with playback time
    // carried over so the swap is seamless. Until the boundary the original
    // track keeps playing. At swap time, every other track is stopped
    // (defensive — covers any case where additional tracks became active).
    smoothSwitch(toKey: string, beatPeriodSec: number): void {
        this.assertExists(toKey);
        if (this.current === toKey || this.current === null) return;
        const fromTrack = this.tracks[this.current];
        const toTrack = this.tracks[toKey];
        const beat = fromTrack.seek % beatPeriodSec;
        const delayMs = (beatPeriodSec - beat) * 1000;
        this.current = toKey; // optimistic — pre-empts re-entrant smoothSwitch
        this.scene.time.delayedCall(delayMs, () => {
            const playbackTime = fromTrack.seek;
            for (const [k, t] of Object.entries(this.tracks)) {
                if (k !== toKey) t.stop();
            }
            toTrack.setSeek(playbackTime);
            toTrack.play();
        });
    }

    // Call from scene shutdown(). Iterates every registered track regardless
    // of which one we think is current — robust to lost state.
    stopAll(): void {
        for (const t of Object.values(this.tracks)) {
            t.stop();
        }
        this.current = null;
    }

    isPlaying(key: string): boolean {
        return this.current === key;
    }

    private assertExists(key: string): void {
        if (!(key in this.tracks)) {
            throw new Error(`MusicController: track "${key}" is not registered`);
        }
    }
}
