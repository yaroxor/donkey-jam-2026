# tools/sfx

Build-time audio synthesis for slick_hand_joe. Python + numpy/scipy primitives, scripts that produce `.wav` files, output committed to `public/assets/music/` alongside the script that produced it.

## Quick start

```bash
# From repo root:
cd tools/sfx
uv sync                                # creates .venv with numpy + scipy
uv run python pluck_groove.py          # → ./pluck_groove.wav (demo)
```

Generated demo outputs (`*.wav` inside this dir) are gitignored. Game-asset outputs go to `../../public/assets/music/<name>.wav` and are committed.

## Library — `synth.py`

Sample-level primitives, no game-specific logic:

- `midi_freq(n)` — MIDI note number → Hz (A4 = 69)
- `adsr(n, a, d, s, r)` — envelope, n samples long, ADSR-shaped
- `karplus_strong(freq, dur, decay=0.996, seed=0)` — plucked-string. Cheap, pluck-y. Tonal pluck/bass.
- `sine_lead(freq, dur)` — fundamental + 2nd + 3rd overtones with ADSR. Warmer than pure sine. Melodic lead.
- `noise_burst(dur, decay=30.0, seed=0)` — white noise with exponential decay. Sharp impact/thud transient.
- `place(track, sound, t_start)` — mix into a track at a given time
- `write_wav(path, mix, peak=0.85)` — peak-normalize → int16 → `.wav` at 44.1 kHz

Importing from sibling scripts: `from synth import ...` (these scripts run from `tools/sfx/`, so `synth.py` is right next to them).

## Adding a new SFX

1. New script `tools/sfx/<name>.py` — combine primitives to taste.
2. Run it: `uv run python <name>.py`.
3. If the output is a game asset, point the script at `../../public/assets/music/<name>.wav`.
4. Commit both the script (`tools/sfx/<name>.py`) and the asset (`public/assets/music/<name>.wav`) so future devs can regenerate or tune without losing the source.
5. Wire into the game: `this.load.audio('<name>', 'music/<name>.wav')` in `Preloader.ts`, then `scene.sound.play('<name>', { volume: effectiveVolume(loadSettings(), 'sfx') })` at the trigger point.

## Demo

`pluck_groove.py` — 10-second 4-bar groove. Karplus-Strong bass walking A minor pentatonic, additive-sine lead ostinato. Doesn't ship — it's a sanity check that the primitives work and a starting point for any future longer-form audio.

## Placeholder music derivation

`boost_placeholders.sh` (ffmpeg, not the Python stack) derives the sus-track placeholders `placeholder-music3/4.mp3` from the musician's track 2 — soft-clip drive + presence on 3, bitcrush/tremolo garble on 4, both loudness-normalized ABOVE the source so the sus ladder escalates in level (v1's bass-boost recipe came out quieter and muffled). Same tempo and length as the source, so the game's tact-aligned music switches stay musical. Regenerate by running it from `tools/sfx/`; the outputs are committed. Real compositions replace them at the same Preloader keys.
