#!/usr/bin/env bash
# Wait for Render's GitHub deployments of a commit to finish.
# Usage: wait-deploy.sh <merge-sha> [timeout minutes, default 30]
# DEPLOY_ENVS overrides the environments to watch, separated by "|".
# Exit 0 = all succeeded, 1 = a deploy failed, 2 = timed out, 4 = a newer deploy replaced one before it finished.
set -u
here=$(cd "$(dirname "$0")" && pwd); . "$here/repo.sh"
sha=$(full_sha "${1:?merge sha required}") || exit 1
limit=${2:-30}
envs=${DEPLOY_ENVS:-"main - it-ticket-board-backend|main - it-ticket-board-frontend"}
end=$(( $(date +%s) + limit * 60 ))
while :; do
  done_all=1; failed=0; replaced=0; summary=""
  old_ifs=$IFS; IFS='|'; set -- $envs; IFS=$old_ifs
  for env in "$@"; do
    id=$(gh api -X GET "repos/$REPO/deployments" -f environment="$env" -f sha="$sha" -f per_page=1 --jq '.[0].id // empty' 2>/dev/null)
    if [ -z "$id" ]; then state="not started"
    else
      # Newest status first. "inactive" only means a newer deploy took over, so look back for how this one ended.
      states=$(gh api "repos/$REPO/deployments/$id/statuses" --jq '[.[].state] | join(" ")' 2>/dev/null)
      state=${states%% *}; state=${state:-queued}
      if [ "$state" = "inactive" ]; then
        state="replaced"
        for s in $states; do case "$s" in success|failure|error) state=$s; break ;; esac; done
      fi
    fi
    case "$state" in
      success) ;;
      failure|error) failed=1 ;;
      replaced) replaced=1; state="replaced by a newer deploy before it finished" ;;
      *) done_all=0 ;;
    esac
    summary="$summary
  $env: $state"
  done
  if [ "$failed" = 1 ]; then echo "A deploy failed for ${sha:0:8}:$summary"; echo "  The previous version keeps running. Check the service's deploy log in the Render dashboard."; exit 1; fi
  if [ "$done_all" = 1 ] && [ "$replaced" = 1 ]; then echo "Not confirmed for ${sha:0:8}:$summary"; echo "  Check the newer deploy that replaced it."; exit 4; fi
  if [ "$done_all" = 1 ]; then echo "Deployed ${sha:0:8}:$summary"; exit 0; fi
  if [ "$(date +%s)" -ge "$end" ]; then echo "Timed out after $limit min for ${sha:0:8}:$summary"; exit 2; fi
  sleep 30
done
