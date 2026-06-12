import { Scene } from 'phaser';

type GameSound = Phaser.Sound.HTML5AudioSound | Phaser.Sound.WebAudioSound;

// Tolerance for "the swap timer fired on the half-tact boundary". A normal
// fire lands within a frame (~17ms) plus small audio-vs-game clock skew;
// anything further means the boundary went stale (the per-scene clock pauses
// with the scene while the game-scoped sound keeps playing — ESC pause).
// 100ms of slip is inaudible at 1.5s half-tacts; a mid-tact swap is not.
const BOUNDARY_TOLERANCE_MS = 100;

// Single source of truth for all music tracks in a scene. Invariant: at most
// one track plays at any time. Adding a new track is one register() call;
// stopAll() and play() handle "stop every other one" structurally, so the
// invariant doesn't depend on remembering each track at every call site.
export class MusicController {
    private tracks: Record<string, GameSound> = {};
    // The switch TARGET — what the game wants playing. isPlaying() reads
    // this (intent), which the e2e music assertions rely on.
    private current: string | null = null;
    // What is actually sounding right now. Lags `current` by up to one
    // half-tact while a swap is pending; smoothSwitch computes the beat
    // boundary from THIS track (the audible one), never from a stopped
    // optimistic target (whose seek reads 0).
    private audibleKey: string | null = null;
    private pendingSwitch: Phaser.Time.TimerEvent | null = null;

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
        this.cancelPendingSwitch();
        for (const [k, t] of Object.entries(this.tracks)) {
            if (k !== key) t.stop();
        }
        this.tracks[key].play();
        this.current = key;
        this.audibleKey = key;
    }

    // Wait until the next beat boundary, then swap tracks with playback time
    // carried over so the swap is seamless. Until the boundary the audible
    // track keeps playing. Single-flight: a newer target supersedes a
    // pending swap outright — one audible transition to the latest target
    // instead of two back-to-back swaps.
    smoothSwitch(toKey: string, beatPeriodSec: number): void {
        this.assertExists(toKey);
        if (this.current === toKey || this.current === null) return;
        this.cancelPendingSwitch();
        this.current = toKey;
        // Superseded back to the track that is still audibly playing —
        // nothing to swap (e.g. A audible, pending swap to B cancelled,
        // target is A again).
        if (this.audibleKey === toKey) return;
        this.scheduleSwap(beatPeriodSec);
    }

    private scheduleSwap(beatPeriodSec: number): void {
        const from = this.tracks[this.audibleKey!];
        const beat = from.seek % beatPeriodSec;
        const delayMs = (beatPeriodSec - beat) * 1000;
        this.pendingSwitch = this.scene.time.delayedCall(delayMs, () => {
            this.pendingSwitch = null;
            // Re-align if the boundary went stale: the per-scene clock
            // pauses with the scene (ESC pause) while the game-scoped sound
            // keeps advancing, so this timer can fire mid-tact after a
            // resume. Reschedule onto the next true boundary instead of
            // swapping off-beat. Drift ≈ period counts as on-boundary (a
            // hair early — audio clock vs game clock skew).
            const driftMs = (from.seek % beatPeriodSec) * 1000;
            const offBoundary = driftMs > BOUNDARY_TOLERANCE_MS
                && driftMs < beatPeriodSec * 1000 - BOUNDARY_TOLERANCE_MS;
            if (offBoundary) {
                this.scheduleSwap(beatPeriodSec);
                return;
            }
            const playbackTime = from.seek;
            const toKey = this.current!; // latest target at fire time
            for (const [k, t] of Object.entries(this.tracks)) {
                if (k !== toKey) t.stop();
            }
            // The carried seek must ride the play() config: Phaser ignores
            // setSeek on a STOPPED sound, and a bare play() resets seek to
            // 0 — the old setSeek-then-play pattern silently restarted
            // every switched-to track from 0:00.
            this.tracks[toKey].play({ seek: playbackTime });
            this.audibleKey = toKey;
        });
    }

    // Call on scene shutdown / level end. Iterates every registered track
    // regardless of which one we think is current — robust to lost state.
    stopAll(): void {
        // Defuse any pending swap FIRST: endLevel can stopAll() in the same
        // clock pass in which an already-elapsed swap timer is queued to
        // fire — without the cancel, the swap would resurrect (and loop)
        // music over the Win/GameOver screen.
        this.cancelPendingSwitch();
        for (const t of Object.values(this.tracks)) {
            t.stop();
        }
        this.current = null;
        this.audibleKey = null;
    }

    private cancelPendingSwitch(): void {
        this.pendingSwitch?.remove();
        this.pendingSwitch = null;
    }

    // Apply a volume multiplier (0.0 to 1.0) to every registered track.
    // Phaser's Sound.setVolume works regardless of play state — it stores
    // the value, and playback respects it whether the track is already
    // playing or not yet started. The Settings scene calls this on every
    // volume adjustment so the change is audible immediately.
    setVolume(v: number): void {
        const clamped = Math.max(0, Math.min(1, v));
        for (const t of Object.values(this.tracks)) {
            t.setVolume(clamped);
        }
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
