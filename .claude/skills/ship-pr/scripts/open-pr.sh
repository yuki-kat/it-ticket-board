#!/usr/bin/env bash
# Open a pull request for the current branch, or show the one already open.
# Usage: open-pr.sh "<title>" <body-file> [--dry-run]
# Prints: #<number> <url> head=<sha>
set -u
here=$(cd "$(dirname "$0")" && pwd); . "$here/repo.sh"
title=${1:?title required}; body=${2:?body file required}; dry=${3:-}
[ -f "$body" ] || { echo "Body file not found: $body" >&2; exit 1; }
branch=$(git branch --show-current)
base=$(gh api "repos/$REPO" --jq .default_branch)
if [ -z "$branch" ] || [ "$branch" = "$base" ]; then echo "On '$branch'. Work on a feature branch, not $base." >&2; exit 1; fi
if [ -n "$(git status --porcelain)" ]; then echo "Uncommitted changes. Commit or drop them first:" >&2; git status --short >&2; exit 1; fi
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse --verify --quiet "refs/remotes/origin/$branch" || true)
if [ "$local_sha" != "$remote_sha" ]; then echo "Branch isn't pushed (or is behind origin). Push first: git push -u origin $branch" >&2; exit 1; fi

owner=${REPO%%/*}
existing=$(gh api -X GET "repos/$REPO/pulls" -f head="$owner:$branch" -f state=open --jq '.[0] | select(. != null) | "#\(.number) \(.html_url) head=\(.head.sha)"')
if [ -n "$existing" ]; then echo "Already open: $existing"; exit 0; fi

if [ "$dry" = "--dry-run" ]; then
  echo "Would open: $REPO $branch -> $base"; echo "Title: $title"; echo "Body:"; sed 's/^/  /' "$body"; exit 0
fi
gh api -X POST "repos/$REPO/pulls" -f title="$title" -f head="$branch" -f base="$base" -F body=@"$body" \
  --jq '"#\(.number) \(.html_url) head=\(.head.sha)"'
