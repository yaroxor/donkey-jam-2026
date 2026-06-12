#!/usr/bin/env bash
# Compose the look-over (look-at-table) placeholder sprite: demon stage 4
# tilted as if leaning over the table, with the spring-eyes drop slapped on
# its face. Output: ../../public/assets/demon/look-over.png (committed).
# Real reaction art from the artist replaces that file later, same key.
#
# Run from tools/art/:  ./compose_look_over.sh
# Works under ImageMagick v6 (container: convert + 'matte' primitive) and
# v7 (macOS host: magick + 'alpha') — v7 renamed the floodfill draw
# primitive and deprecated the convert entry point.
#
# ADJUSTMENT KNOBS — tweak these and rerun; everything else is plumbing.
TILT_DEG=-25      # negative = lean left (demon sits screen-right, table is left)
EYES_TILT_DEG=-25 # eyes overlay rotation; matches the demon lean by default
EYES_WIDTH=100    # eyes overlay width in px after scaling (native 438 keyed)
EYES_X=95         # eyes top-left X on the rotated-demon canvas
EYES_Y=225        # eyes top-left Y on the rotated-demon canvas

set -euo pipefail

if command -v magick >/dev/null 2>&1; then
  IM="magick"; MATTE="alpha"   # ImageMagick v7
else
  IM="convert"; MATTE="matte"  # ImageMagick v6
fi

DEMON="../../public/assets/demon/4.png"          # 531x627, alpha
EYES_SRC="eyes-src.jpg"                          # 840x330 JPEG, checkerboard baked in
OUT="../../public/assets/demon/look-over.png"

# 1. Key the eyes: corner floodfill removes the connected outer checker;
#    two tight color keys clear the pockets enclosed by the spring coils
#    (neutral 254-white / 204-gray; the eyeball whites are warm cream
#    ~rgb(235,224,196), well outside both fuzz windows).
"$IM" "$EYES_SRC" -alpha set -fuzz 12% -fill none \
  -draw "$MATTE 0,0 floodfill" -draw "$MATTE 839,0 floodfill" \
  -draw "$MATTE 0,329 floodfill" -draw "$MATTE 839,329 floodfill" \
  -fuzz 4% -transparent 'rgb(254,254,254)' \
  -fuzz 8% -transparent 'rgb(204,205,200)' \
  -trim +repage /tmp/look-over-eyes.png

# 2. Tilt the demon (transparent background; canvas auto-expands).
"$IM" "$DEMON" -background none -rotate "$TILT_DEG" +repage /tmp/look-over-demon.png

# 3. Slap the eyes on top at the knob offsets (mirrored around the
#    vertical axis and tilted with the demon — user direction).
"$IM" /tmp/look-over-demon.png \
  \( /tmp/look-over-eyes.png -flop -resize "${EYES_WIDTH}x" \
     -background none -rotate "$EYES_TILT_DEG" +repage \) \
  -geometry "+${EYES_X}+${EYES_Y}" -compose over -composite \
  "$OUT"

identify "$OUT"
