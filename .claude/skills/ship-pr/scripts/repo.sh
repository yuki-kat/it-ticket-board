# Sourced by the other scripts: sets REPO to owner/name from the git remote (or keeps REPO if already set).
# Works with https://github.com/o/r(.git), git@github.com:o/r.git and proxy URLs ending in /o/r.
REPO=${REPO:-$(git remote get-url origin | sed -E 's#\.git$##; s#.*[/:]([^/:]+/[^/:]+)$#\1#')}
if [ -z "$REPO" ]; then echo "Could not work out the GitHub repo from 'git remote get-url origin'. Set REPO=owner/name." >&2; exit 1; fi
# Full commit SHA for a short SHA, branch or tag, resolved by GitHub so it also works for commits not fetched locally.
full_sha() { gh api "repos/$REPO/commits/$1" --jq .sha; }
