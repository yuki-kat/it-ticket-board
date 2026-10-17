#!/usr/bin/env bash
# Final checks on a finished video: decodes end to end, streams and duration, loudness and peak.
# Usage: check.sh <video.mp4>
# There is no way to listen here, so these numbers are the evidence; the user still has to listen once.
set -euo pipefail
FF=${FFMPEG:-$(command -v ffmpeg)}
"$FF" -hide_banner -v error -i "$1" -f null - && echo "decodes cleanly"
{ "$FF" -hide_banner -i "$1" 2>&1 || true; } | grep -E 'Duration|Stream' | tr -s ' '   # ffmpeg exits 1 when given no output
"$FF" -hide_banner -nostats -i "$1" -af ebur128=peak=true -f null - 2>&1 | grep -A14 Summary | grep -E 'I:|LRA:|Peak:' | tr -s ' ' | tr '\n' ' '
echo
