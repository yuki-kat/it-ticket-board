#!/usr/bin/env bash
# Wait for a CI check on a commit to finish.
# Usage: wait-ci.sh <sha> [check-name, default browser-tests] [timeout minutes, default 30]
# Exit 0 = passed, 1 = failed/cancelled/skipped, 2 = timed out.
set -u
here=$(cd "$(dirname "$0")" && pwd); . "$here/repo.sh"
sha=$(full_sha "${1:?commit sha required}") || exit 1
check=${2:-browser-tests}; limit=${3:-30}
end=$(( $(date +%s) + limit * 60 ))
while :; do
  result=$(gh api "repos/$REPO/commits/$sha/check-runs" --jq "[.check_runs[] | select(.name == \"$check\")][0] | select(. != null) | \"\(.status) \(.conclusion)\"" 2>/dev/null)
  case "$result" in
    "completed success") echo "$check passed on ${sha:0:8}"; exit 0 ;;
    "completed "*) echo "$check finished on ${sha:0:8}: ${result#completed }. See https://github.com/$REPO/commit/$sha/checks"; exit 1 ;;
  esac
  if [ "$(date +%s)" -ge "$end" ]; then echo "Timed out after $limit min waiting for $check on ${sha:0:8} (last state: ${result:-not started})"; exit 2; fi
  sleep 20
done
