#!/usr/bin/env bash
# Derive placeholder sus-tracks 3/4 from the musician's track 2 until the
# real compositions land. Derived-from-the-same-song placeholders keep tempo
# and length identical, so the MusicController's tact-aligned, seek-carrying
# switches stay musical.
#
# v2 recipe (playtest feedback on v1: bass boost + compression came out
# QUIETER and muffled -- the boosted lows ate the limiter headroom). v2 goes
# the other way: drive/garble for tension and loudnorm ABOVE the source so
# the ladder escalates in level too. Measured (volumedetect mean): source
# -18.8 dB -> music3 -14.2 dB -> music4 -12.2 dB.
#
# Run from tools/sfx/:  ./boost_placeholders.sh
# Output: ../../public/assets/music/placeholder-music{3,4}.mp3 (committed).
# When the musician delivers, drop the real files in and point Preloader's
# music3/music4 lines at them -- no other code changes (keys stay the same).
set -euo pipefail

SRC="../../public/assets/music/Slick Hand Joe 2.mp3"
OUT_DIR="../../public/assets/music"

# music3: tenser -- presence lift + soft-clip drive, normalized to -14 LUFS.
ffmpeg -v error -y -i "$SRC" \
  -af "bass=g=5:f=110,treble=g=3.5:f=3200,volume=4dB,asoftclip=type=atan,loudnorm=I=-14:TP=-1.0:LRA=11" \
  -ar 44100 -c:a libmp3lame -b:a 192k "$OUT_DIR/placeholder-music3.mp3"

# music4: aggressive garble -- bitcrush + downsample, 6 Hz tremolo pulse for
# alarm urgency, hard-clip drive, normalized to -12 LUFS (loudest rung).
ffmpeg -v error -y -i "$SRC" \
  -af "bass=g=6:f=110,acrusher=bits=5:mode=log:aa=1:samples=4:mix=0.85,tremolo=f=6:d=0.35,volume=6dB,asoftclip=type=hard,loudnorm=I=-12:TP=-1.0:LRA=9" \
  -ar 44100 -c:a libmp3lame -b:a 192k "$OUT_DIR/placeholder-music4.mp3"

echo "done:"
for f in placeholder-music3 placeholder-music4; do
  ffprobe -v error -show_entries format=duration -of csv "$OUT_DIR/$f.mp3"
  ffmpeg -i "$OUT_DIR/$f.mp3" -af volumedetect -f null - 2>&1 | grep mean_volume
done
