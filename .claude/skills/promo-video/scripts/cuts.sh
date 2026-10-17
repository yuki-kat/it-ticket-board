#!/usr/bin/env bash
# Scene cuts and a contact sheet for a video, so music and lyrics can be timed to what is on screen.
# Usage: cuts.sh <video.mp4> [threshold=0.25] [sheet.png]
# Prints the cut times (seconds) on one line. Fades and similar-looking pages score low; lower the threshold
# (0.08) to see them, and confirm ambiguous ones on the sheet, which shows one frame per second.
set -euo pipefail
video=$1; thr=${2:-0.25}; sheet=${3:-}
FF=${FFMPEG:-$(command -v ffmpeg)}
"$FF" -hide_banner -nostats -i "$video" -vf "select='gt(scene,$thr)',showinfo" -an -f null - 2>&1 \
  | grep -oE 'pts_time:[0-9.]+' | cut -d: -f2 | awk '{printf "%.2f ", $1} END {print ""}'
if [ -n "$sheet" ]; then
  dur=$({ "$FF" -hide_banner -i "$video" 2>&1 || true; } | grep -oE 'Duration: [0-9:.]+' | awk -F'[: ]' '{print int($3*3600+$4*60+$5)}')
  rows=$(( (dur + 9) / 10 ))
  "$FF" -hide_banner -loglevel error -y -i "$video" -vf "fps=1,scale=192:-1,tile=10x${rows}:padding=4:color=white" -frames:v 1 "$sheet"
  echo "sheet: $sheet (10 frames per row, one per second, starting at 0s)"
fi
