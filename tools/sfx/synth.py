"""Sample-level audio synthesis primitives for slick_hand_joe SFX.

Generic building blocks (no game-specific logic). Scripts in this directory
use these to render specific SFX or music to .wav files. Single source of
truth for the synthesis style (Karplus-Strong + additive sine with harmonics
+ ADSR + noise burst), so adding a new SFX is one new short script that
imports the primitives, not one new synth-from-scratch.

Usage:
    from synth import SR, karplus_strong, place, write_wav, midi_freq
    note = karplus_strong(midi_freq(45), dur=0.4)
    track = np.zeros(int(2.0 * SR))
    place(track, note, t_start=0.5)
    write_wav('output.wav', track)
"""
import numpy as np
from scipy.io import wavfile

SR = 44100  # 44.1 kHz sample rate


def midi_freq(n: int) -> float:
    """MIDI note number -> Hz. A4 (note 69) = 440."""
    return 440.0 * 2 ** ((n - 69) / 12)


def adsr(n: int, a: float = 0.01, d: float = 0.05, s: float = 0.6, r: float = 0.2) -> np.ndarray:
    """Attack/Decay/Sustain/Release envelope, n samples long.

    a, d, r in seconds. s is the sustain level (0..1) held between decay and
    release. Tail-trims to n samples if a+d+r exceeds dur -- useful for very
    short impacts where the envelope itself is shorter than ADSR would imply.
    """
    a_n = int(a * SR)
    d_n = int(d * SR)
    r_n = int(r * SR)
    s_n = max(n - a_n - d_n - r_n, 0)
    return np.concatenate([
        np.linspace(0, 1, a_n),
        np.linspace(1, s, d_n),
        np.full(s_n, s),
        np.linspace(s, 0, r_n),
    ])[:n]


def karplus_strong(freq: float, dur: float, decay: float = 0.996, seed: int = 0) -> np.ndarray:
    """Plucked string via Karplus-Strong. Loop a noise buffer, low-pass each round.

    Cheap and pluck-y. Good for tonal bass and plucked-attack SFX.
    """
    n_buf = max(int(SR / freq), 2)
    rng = np.random.default_rng(seed)
    buf = rng.uniform(-1, 1, n_buf)
    n_out = int(dur * SR)
    out = np.zeros(n_out)
    for i in range(n_out):
        out[i] = buf[i % n_buf]
        buf[i % n_buf] = decay * 0.5 * (buf[i % n_buf] + buf[(i + 1) % n_buf])
    return out * 0.6


def sine_lead(freq: float, dur: float) -> np.ndarray:
    """Additive: fundamental + 2nd + 3rd overtones with ADSR envelope.

    Warmer than a pure sine, simpler than full FM. Good for melodic lead.
    """
    t = np.linspace(0, dur, int(dur * SR), endpoint=False)
    s = (np.sin(2 * np.pi * freq * t)
         + 0.25 * np.sin(2 * np.pi * freq * 2 * t)
         + 0.10 * np.sin(2 * np.pi * freq * 3 * t))
    return s * adsr(len(s), a=0.02, d=0.1, s=0.7, r=0.25) * 0.35


def noise_burst(dur: float, decay: float = 30.0, seed: int = 0) -> np.ndarray:
    """White noise with an exponential decay. Sharp transient for impact/thud
    attacks, often layered under a tonal body.

    Higher `decay` means a shorter, sharper burst. decay=30 gives ~100ms of
    audible noise; decay=10 gives ~300ms.
    """
    n = int(dur * SR)
    rng = np.random.default_rng(seed)
    samples = rng.uniform(-1, 1, n)
    envelope = np.exp(-decay * np.linspace(0, dur, n))
    return samples * envelope


def place(track: np.ndarray, sound: np.ndarray, t_start: float) -> None:
    """Mix `sound` into `track` starting at `t_start` seconds. Clips at track end."""
    i = int(t_start * SR)
    end = min(i + len(sound), len(track))
    track[i:end] += sound[:end - i]


def write_wav(path: str, mix: np.ndarray, peak: float = 0.85) -> None:
    """Peak-normalize, scale to int16, write to .wav at SR."""
    m = float(np.max(np.abs(mix))) or 1.0
    normalized = mix / m
    audio = (normalized * peak * 32767).astype(np.int16)
    wavfile.write(path, SR, audio)
