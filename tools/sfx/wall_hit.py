"""Wall-hit SFX for the hand-vs-block stun mechanic.

Renders to ../../public/assets/music/wall-hit.wav.

Composition: short percussive thud, ~300ms total.
  - Impact transient (noise burst, sharp decay) -- the "smack"
  - Low Karplus-Strong pluck (~A1) -- the body/resonance of hitting a wood table
  - Higher Karplus-Strong overtone (~A2, softer) -- wood character

Tune by adjusting:
  - midi note for fundamental -> pitch of the thud
  - karplus `decay` -> ring length (0.97 ~= 300ms, 0.99 ~= 800ms)
  - noise_burst `decay` -> sharpness of the initial smack
  - per-layer mix weights -> balance of transient vs body
"""
import numpy as np
from synth import SR, karplus_strong, noise_burst, midi_freq, place, write_wav

OUT = '../../public/assets/music/wall-hit.wav'

dur = 0.35  # 350ms total
n_total = int(dur * SR)
track = np.zeros(n_total)

# Impact transient at t=0 -- sharp 80ms burst.
impact = noise_burst(dur=0.08, decay=40.0)
place(track, impact * 0.5, 0.0)

# Low body -- A1 (midi 33, ~55Hz). Short-decay karplus for thud resonance.
body = karplus_strong(midi_freq(33), dur=0.30, decay=0.97)
place(track, body * 0.7, 0.005)  # 5ms after the impact peak

# Higher overtone -- A2 (midi 45, ~110Hz). Softer mix for "wood" character.
overtone = karplus_strong(midi_freq(45), dur=0.18, decay=0.95)
place(track, overtone * 0.3, 0.005)

write_wav(OUT, track)
print(f"Wrote {n_total / SR:.2f}s to {OUT}")
