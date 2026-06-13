"""10-second generative groove -- demo of the synth primitives.

Renders to ./pluck_groove.wav (gitignored). Bass: Karplus-Strong plucked,
A minor pentatonic walking line. Lead: additive sine ostinato over 4 bars
at 95 bpm. See README.md for the synthesis approach.

Doesn't go in the game -- it's a sanity check that the primitives work and
a starting point for any future longer-form audio.
"""
import numpy as np
from synth import SR, midi_freq, karplus_strong, sine_lead, place, write_wav

# 4-bar piece at 95 bpm, 4/4.
bpm = 95
beat = 60 / bpm
bar = 4 * beat
total = 4 * bar

n_total = int(total * SR)
bass = np.zeros(n_total)
lead = np.zeros(n_total)

# A minor pentatonic. Bass walks A2-A2-E2-G2 every bar.
bass_pattern = [45, 45, 40, 43]
for bar_i in range(4):
    for beat_i, midi in enumerate(bass_pattern):
        place(
            bass,
            karplus_strong(midi_freq(midi), beat * 0.95),
            bar_i * bar + beat_i * beat,
        )

# Lead: descending phrase in bars 1-2, lifted an octave + resolving in bars 3-4.
lead_phrases = [
    [(57, 0.5), (60, 0.5), (64, 0.5), (67, 0.5), (64, 0.5), (60, 0.5), (62, 1.0)],
    [(57, 0.5), (60, 0.5), (62, 0.5), (64, 0.5), (62, 0.5), (60, 0.5), (57, 1.0)],
    [(67, 0.5), (69, 0.5), (72, 0.5), (74, 0.5), (72, 0.5), (69, 0.5), (67, 1.0)],
    [(64, 0.5), (62, 0.5), (60, 0.5), (57, 0.5), (64, 0.5), (67, 0.5), (69, 1.0)],
]
for bar_i, phrase in enumerate(lead_phrases):
    t = bar_i * bar
    for midi, dur_beats in phrase:
        d = dur_beats * beat
        place(lead, sine_lead(midi_freq(midi), d), t)
        t += d

write_wav('./pluck_groove.wav', bass + lead)
print(f"Wrote {n_total / SR:.2f}s to ./pluck_groove.wav")
