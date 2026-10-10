#!/usr/bin/env bash
# Merge a pull request, but only if its head is still the commit CI passed on.
# Usage: merge.sh <pr-number> <head-sha-that-passed-CI> [--bypass]
# --bypass merges through branch rules with the user's admin bypass. Pass it only after the user
# said "bypass" for this PR.
# Exit 0 = merged (or already merged), 1 = refused, 3 = blocked by branch rules (needs the user).
set -u
here=$(cd "$(dirname "$0")" && pwd); . "$here/repo.sh"
pr=${1:?pr number required}
expected=$(full_sha "${2:?head sha required}") || exit 1
bypass=${3:-}

# GitHub computes mergeability in the background, so it can be null for a few seconds.
for attempt in 1 2 3 4 5; do
  info=$(gh api "repos/$REPO/pulls/$pr" --jq '"\(.state) \(.merged) \(.mergeable) \(.mergeable_state) \(.head.sha) \(.merge_commit_sha)"') || exit 1
  set -- $info; state=$1 merged=$2 mergeable=$3 mstate=$4 head=$5 merge_sha=$6
  [ "$mergeable" != "null" ] && break
  sleep 3
done

if [ "$merged" = "true" ]; then echo "Already merged #$pr as ${merge_sha:0:8}"; exit 0; fi
if [ "$state" != "open" ]; then echo "#$pr is $state and not merged. Not reopening it." >&2; exit 1; fi
if [ "$head" != "$expected" ]; then echo "#$pr head moved to ${head:0:8} since CI passed on ${expected:0:8}. Wait for CI on the new head first." >&2; exit 1; fi
case "$mstate" in
  clean) ;;
  dirty) echo "#$pr has a merge conflict. Merge $REPO's base branch into it, rebuild index.html if needed, and push." >&2; exit 1 ;;
  blocked)
    if [ "$bypass" != "--bypass" ]; then
      echo "#$pr is blocked by branch rules (for example a required review). Ask the user: they merge it in GitHub, or say \"bypass\" and you rerun with --bypass." >&2; exit 3
    fi
    echo "#$pr is blocked by branch rules; merging with the user's bypass." ;;
  behind) echo "#$pr is behind its base and the rules require it to be up to date. Merge the base branch in and wait for CI again." >&2; exit 1 ;;
  *) echo "#$pr isn't ready to merge (state: $mstate). Check its checks on GitHub." >&2; exit 1 ;;
esac

if out=$(gh api -X PUT "repos/$REPO/pulls/$pr/merge" -f merge_method=merge -f sha="$expected" --jq .sha 2>&1); then
  echo "Merged #$pr as ${out:0:8}"
else
  echo "GitHub refused the merge of #$pr: $out" >&2
  case "$out" in *"405"*|*"protected"*|*"rule"*|*"review"*) exit 3 ;; esac
  exit 1
fi
