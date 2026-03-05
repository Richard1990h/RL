#!/usr/bin/env bash
#
# fix-moov-atom.sh
#
# Rewrites all MP4 files in the uploads directory so the moov atom
# is at the beginning of the file. This is required for browsers to
# start playback immediately — without it, the browser must download
# the entire mdat block before it can parse the moov atom and render
# a single frame.
#
# Uses: ffmpeg -c copy -movflags +faststart (no re-encode, lossless)
#
# Usage:
#   bash scripts/fix-moov-atom.sh                    # default: ./uploads
#   bash scripts/fix-moov-atom.sh /path/to/uploads   # custom dir

set -euo pipefail

UPLOAD_DIR="${1:-./uploads}"
FIXED=0
SKIPPED=0
FAILED=0

echo "=== fix-moov-atom ==="
echo "Scanning: $UPLOAD_DIR"
echo ""

while IFS= read -r -d '' file; do
  # Check if moov is already before mdat by inspecting atom order.
  # ffprobe -v trace prints atom offsets; if moov appears before mdat, skip.
  atom_order=$(ffprobe -v trace "$file" 2>&1 | grep -oP 'type:\x27(moov|mdat)\x27' | head -2 || true)

  first_atom=$(echo "$atom_order" | head -1 || true)

  if [[ "$first_atom" == *"moov"* ]]; then
    echo "SKIP (already faststart): $file"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "FIX: $file"

  tmp="${file}.faststart.tmp.mp4"

  if ffmpeg -nostdin -v warning -i "$file" -c copy -movflags +faststart -y "$tmp" 2>&1; then
    # Verify output has non-zero size
    if [ -s "$tmp" ]; then
      mv "$tmp" "$file"
      FIXED=$((FIXED + 1))
      echo "  -> done"
    else
      echo "  -> ERROR: output was empty, keeping original"
      rm -f "$tmp"
      FAILED=$((FAILED + 1))
    fi
  else
    echo "  -> ERROR: ffmpeg failed, keeping original"
    rm -f "$tmp"
    FAILED=$((FAILED + 1))
  fi

done < <(find "$UPLOAD_DIR" -type f -name "*.mp4" -print0)

echo ""
echo "=== Results ==="
echo "Fixed:   $FIXED"
echo "Skipped: $SKIPPED"
echo "Failed:  $FAILED"
