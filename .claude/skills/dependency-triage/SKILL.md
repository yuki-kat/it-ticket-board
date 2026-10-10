---
name: dependency-triage
description: Triage and fix npm security alerts in the IT Ticket Board. Audits every package (app, server, tests, root), sorts each finding into "reaches users" vs "build or test only", applies only safe fixes, tests major upgrades against the feature that uses them, proves nothing else changed, and ships with ship-pr. Use this whenever the user mentions Dependabot, security alerts, vulnerabilities, npm audit, a Dependabot PR, outdated or vulnerable packages, or GitHub's "found N vulnerabilities" message after a push, even if they only ask "what are these alerts?" or "can you fix the Dependabot stuff".
---

# Dependency triage

An alert count says little on its own. A denial-of-service bug in a build tool matters far less than one in the Express server that faces the internet. The job is to find out which findings actually reach users, fix those safely, and give the user a clear reason for everything left open.

## Where each package runs

| Folder | What it is | Where it runs | Weight |
| --- | --- | --- | --- |
| `server/` | Express + Postgres backend | Render, public internet | **Highest**: runtime code |
| `app/` | React front end, built by Vite and Tailwind into `index.html` | Your build machine; only the built page ships | Runtime only if `app/src` imports it; Vite, Tailwind and PostCSS are build-time |
| `tests/` | Playwright | CI and your machine | Dev only |
| root | Workspace helpers | Dev only | Low |

## Session limits (cloud sessions)

- The Dependabot alerts API returns 403, so use `npm audit` (`scripts/audit.sh`). The user can see the real alert list at `https://github.com/<repo>/security/dependabot`. Ask them for a screenshot when you need to compare.
- Dismissing alerts and deleting branches are blocked. The user does those in GitHub (steps below).
- Closing a PR works: `gh api -X PATCH repos/<repo>/pulls/<n> -f state=closed`.

## Steps

**1. Branch from the real `main`.** In a shallow cloud clone, a local `main` can be months old, and `git checkout main` silently lands on it. That once produced an audit of old lockfiles. Always run:

```bash
git fetch origin main && git checkout -B fix/<name> origin/main
```

**2. Audit every package:**

```bash
bash .claude/skills/dependency-triage/scripts/audit.sh <repo>
```

`fix=yes` means `npm audit fix` can solve it within the allowed version range. `fix=major:<pkg>@<ver>` needs a breaking upgrade. `fix=no` means npm knows no fix yet.

**3. Decide each finding.** Work out first what the package does here:

```bash
grep -rn "from '<pkg>'\|require('<pkg>')" <dir>/src <dir>/scripts
npm ls <pkg>            # in that folder: who pulls it in
```

Then take the first option that fits:
- **Nothing imports it** → remove it with `npm uninstall <pkg>`, plus its `@types/<pkg>`. Removing code beats patching it. Example: `uuid` in the server was never used.
- **`fix=yes`** → run `npm audit fix` in that folder. **Never use `--force`**: it installs breaking majors without telling you.
- **A major upgrade is needed and the package runs at runtime** → read its changelog for every breaking change between the two versions. Compare each one with how the code uses the package, then test the feature that uses it, end to end (step 4). Example: multer 1→2 was checked against the matrix upload route, including size, type, permission and download checks.
- **No fix within the current major, and it's build or test only** → leave it. Tell the user why, and give them the dismissal steps below. Don't start a framework migration (such as Tailwind 3→4) unless the user asks. They chose to skip it in Oct 2026 because it costs a lot for no change to the shipped page.

A Dependabot PR is a suggestion, not a fix you have to take. It often can't be merged as it stands, for example when it's behind `main` or bundles a major upgrade. Make the change on your own branch so you can test it, then close the Dependabot PR once yours merges.

**4. Prove only what you intended changed:**

```bash
bash .claude/skills/dependency-triage/scripts/lock-diff.sh <repo>     # packages added, removed or changed vs origin/main
```

- **Server:** run `cd server && npm run build`. If a runtime package changed, run the real feature against a fresh local Postgres: `sudo -u postgres psql -c "CREATE DATABASE <name>"`, then `DATABASE_URL=… npm run migrate`, then `node dist/index.js` with `PORT` and `JWT_SECRET` set. Then `curl` the routes. Drop the database and stop the server afterwards. Never use `pkill -f` with a pattern that also appears in your own command line, because it kills your shell.
- **App:** run `cd app && npm run build:page`, then `git diff --stat index.html`. **No diff means the built page is byte-identical**, which is the strongest proof that a build-tool bump changed nothing for users. If `index.html` changes, run the browser tests and take screenshots as in `ticket-board-iterate`.
- **Re-run `audit.sh`** to show the before and after counts.

**5. Ship it** with the `ship-pr` skill. In the PR body, include a before/after table per package and say why each remaining finding is left. After the merge, close any Dependabot PR that your change replaced.

## Dismissing alerts (the user does this in GitHub)

1. Open `https://github.com/<repo>/security/dependabot`.
2. Tick the alerts that are build or test only and have no fix.
3. Click **Dismiss alerts**, then **Risk is tolerable to this project**, and add a comment such as "Build-time only via Tailwind 3; not shipped in the page."

GitHub automatically closes alerts for packages that have been fixed or removed after its next scan. It also auto-dismisses some development-only alerts, so the open list can be shorter than `npm audit` suggests.

## State as of Oct 2026

- `server`: 0 findings. `multer` is 2.4.0, and `uuid` was removed.
- `app`: 8 findings, all from `tailwindcss` 3.4.1 (pinned exactly) through `chokidar`, `braces`, `micromatch`, `fast-glob`, `postcss-nested` and `postcss-selector-parser`. They're build-time only, have no fix within Tailwind 3, and are dismissed in Dependabot as tolerable. Expect `audit.sh` to keep showing them. They aren't new.
- `tests` and root: 0 findings.

## Report

Keep it short:
- a before/after count per package;
- what changed and why (removed, patched, or major upgrade plus what you tested);
- the PR link and its deploy result;
- what's left, why, and anything the user needs to click.
