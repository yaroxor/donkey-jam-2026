#!/usr/bin/env bash
# Compose the look-over (look-at-table) placeholder sprite: demon stage 4
# tilted as if leaning over the table, with the spring-eyes drop slapped on
# its face. Output: ../../public/assets/demon/look-over.png (committed).
# Real reaction art from the artist replaces that file later, same key.
#
# Run from tools/art/:  ./compose_look_over.sh
#
# ADJUSTMENT KNOBS — tweak these and rerun; everything else is plumbing.
TILT_DEG=-25      # negative = lean left (demon sits screen-right, table is left)
EYES_WIDTH=380    # eyes overlay width in px after scaling (native 438 keyed)
EYES_X=130        # eyes top-left X on the rotated-demon canvas
EYES_Y=130        # eyes top-left Y on the rotated-demon canvas

set -euo pipefail

DEMON="../../public/assets/demon/4.png"          # 531x627, alpha
EYES_SRC="eyes-src.jpg"                          # 840x330 JPEG, checkerboard baked in
OUT="../../public/assets/demon/look-over.png"

# 1. Key the eyes: corner floodfill removes the connected outer checker;
#    two tight color keys clear the pockets enclosed by the spring coils
#    (neutral 254-white / 204-gray; the eyeball whites are warm cream
#    ~rgb(235,224,196), well outside both fuzz windows).
convert "$EYES_SRC" -alpha set -fuzz 12% -fill none \
  -draw 'matte 0,0 floodfill' -draw 'matte 839,0 floodfill' \
  -draw 'matte 0,329 floodfill' -draw 'matte 839,329 floodfill' \
  -fuzz 4% -transparent 'rgb(254,254,254)' \
  -fuzz 8% -transparent 'rgb(204,205,200)' \
  -trim +repage /tmp/look-over-eyes.png

# 2. Tilt the demon (transparent background; canvas auto-expands).
convert "$DEMON" -background none -rotate "$TILT_DEG" +repage /tmp/look-over-demon.png

# 3. Slap the eyes on top at the knob offsets.
convert /tmp/look-over-demon.png \
  \( /tmp/look-over-eyes.png -resize "${EYES_WIDTH}x" \) \
  -geometry "+${EYES_X}+${EYES_Y}" -compose over -composite \
  "$OUT"

identify "$OUT"
