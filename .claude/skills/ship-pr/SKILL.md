---
name: ship-pr
description: Ship a finished branch of the IT Ticket Board to the live site. Opens a pull request using the repo's template, waits for the browser-tests check, merges when it is green (guarded by the head commit), then confirms that Render deployed both the backend and the frontend. Use this whenever the user says "ship it", "open a PR", "merge it when CI finishes", "merge it", "get this live" or "has it deployed", or once a change is committed and the next step is getting it onto main, even if they only name one of those steps.
---

# Ship a pull request

`main` is what Render deploys, so a merge here goes straight to the live site. The routine is always the same:
open PR → wait for `browser-tests` → merge → wait for both Render deploys → report.
The scripts in `scripts/` do the API calls and the waiting, which keeps each run cheap.

## What the user has agreed to

The user wants to confirm outward-facing steps (pushing a new branch, opening a PR, merging), so do only the steps they asked for:

- "ship it", "merge it when CI finishes", "get this live": the whole routine, including the merge.
- "open a PR": stop after the PR is open and CI has reported. Then ask about merging.
- "merge it" on an open PR: merge (after CI is green) and confirm the deploys.
- Anything else: say what you're about to do and ask first.

Never merge red CI, never skip or disable a test to get green, and never bypass a branch rule. If GitHub says the PR needs a review, the user approves or merges it themselves in GitHub.

## Before opening the PR

1. You are on a feature branch, not `main`, and `git status` is clean. Look for stray files before committing (`test-results/`, screenshots, `.env` files, anything with a key or password in it).
2. If anything in `app/src/` changed, `index.html` has been rebuilt (`cd app && npm run build:page`) and committed. CI fails the PR when it's out of date.
3. The browser tests have passed locally for code changes (`bash .claude/skills/ticket-board-iterate/scripts/run-tests.sh <repo>`), unless the user said to skip them.
4. The branch is pushed: `git push -u origin <branch>`. In a shallow cloud clone, also run `git config --add remote.origin.fetch '+refs/heads/<branch>:refs/remotes/origin/<branch>'`, then `git fetch origin <branch>`.

## Steps

All scripts live in `.claude/skills/ship-pr/scripts/` and work out the repo from `git remote`. They use `gh api` (REST) because `gh pr create`/`gh pr merge` need GraphQL, which cloud sessions block.

**1. Open the PR.** Write the body to a file first, using the headings of `.github/pull_request_template.md` (Summary, Why, Testing, Type, Checklist).
- Tick only the boxes you actually did. For any box left unticked, say why (for example "tested the built page with Playwright instead of `npm run dev`").
- End the body with the attribution lines from the session's instructions, if it has any. Never name an AI model.

```bash
bash .claude/skills/ship-pr/scripts/open-pr.sh "<title>" <body-file>    # prints: #<n> <url> head=<sha>
```

If the branch already has an open PR, the script prints that one instead of creating another.

**2. Wait for CI** in the background (`run_in_background`), so no tokens are spent while it runs:

```bash
bash .claude/skills/ship-pr/scripts/wait-ci.sh <head-sha>     # exit 0 passed, 1 failed, 2 timed out
```

If it fails, read the failing test from the Actions run and reproduce it locally. Fix it, push, and wait again. A failure is real until shown otherwise.

**3. Merge**, only when CI passed and the user agreed:

```bash
bash .claude/skills/ship-pr/scripts/merge.sh <pr-number> <head-sha>   # prints: Merged #<n> as <sha>
```

It refuses in these cases, and tells you why:
- the head moved since CI ran;
- there is a merge conflict;
- branch rules block it (exit 3: the user needs to approve or merge it themselves).

The repo uses merge commits.

**4. Confirm the deploys** in the background:

```bash
bash .claude/skills/ship-pr/scripts/wait-deploy.sh <merge-sha>   # exit 0 both succeeded, 1 a deploy failed, 2 timed out
```

Exit 4 means a newer deploy (from a later merge) replaced this one before it finished. Check that newer deploy instead.

If the backend deploy fails, the previous version keeps running, so the site isn't down. The usual cause has been the database migration that runs before `npm start`:
- `CREATE TABLE IF NOT EXISTS` never adds new columns to a table that already exists. Columns need `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
- Foreign keys can only point at tables created earlier in `server/src/db/schema.sql`.

Reproduce the failure by migrating a local Postgres from the previous `schema.sql` to the new one. Then fix it and ship the fix as a new PR.

## Report

Keep it short, with evidence for each step:

- the PR link
- the CI result
- the merge commit
- the backend and frontend deploy results
- anything still open

Separate what you verified from what you inferred.
