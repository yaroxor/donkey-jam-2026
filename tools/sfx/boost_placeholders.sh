#!/usr/bin/env bash
# Derive placeholder sus-tracks 3/4 from the musician's track 2 (bass boost +
# compression, heavier on 4) until the real compositions land. Derived-from-
# the-same-song placeholders keep tempo and length identical, so the
# MusicController's tact-aligned, seek-carrying switches stay musical.
#
# Run from tools/sfx/:  ./boost_placeholders.sh
# Output: ../../public/assets/music/placeholder-music{3,4}.mp3 (committed).
# When the musician delivers, drop the real files in and point Preloader's
# music3/music4 lines at them — no other code changes (keys stay the same).
set -euo pipefail

SRC="../../public/assets/music/Slick Hand Joe 2.mp3"
OUT_DIR="../../public/assets/music"

# music3: noticeably tenser — bass lift + gentle 3:1 compression for punch.
ffmpeg -v error -y -i "$SRC" \
  -af "bass=g=8:f=110,acompressor=threshold=-18dB:ratio=3:attack=20:release=250,alimiter=limit=0.95" \
  -c:a libmp3lame -b:a 192k "$OUT_DIR/placeholder-music3.mp3"

# music4: aggressive — heavier bass, harmonic exciter, 5:1 compression.
ffmpeg -v error -y -i "$SRC" \
  -af "bass=g=14:f=110,aexciter=level_in=1:level_out=1:amount=2,acompressor=threshold=-22dB:ratio=5:attack=10:release=200,alimiter=limit=0.95" \
  -c:a libmp3lame -b:a 192k "$OUT_DIR/placeholder-music4.mp3"

echo "done:"
ffprobe -v error -show_entries format=duration -of csv "$OUT_DIR/placeholder-music3.mp3"
ffprobe -v error -show_entries format=duration -of csv "$OUT_DIR/placeholder-music4.mp3"
