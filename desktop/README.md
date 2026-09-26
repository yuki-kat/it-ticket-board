# IT Ticket Board — desktop app

The ticket board packaged as a desktop app for **Windows** (`.exe` installer) and **Mac** (`.dmg`, Apple Silicon and Intel), built in the cloud by GitHub Actions.

**Status:** merged into `main` on 26 Sep 2026. Installers are built by hand, not automatically (see below).

## How it works

- The app page is the repo's own `../index.html`. `scripts/copyApp.js` copies it into `desktop/app/` before every build or local run, so there's only one file to edit and the desktop app always matches it. (`desktop/app/` isn't committed.)
- `main.js` opens that page in a desktop window. Links to websites and email open in your normal browser or mail app.
- `scripts/afterPackSign.js` ad-hoc signs the Mac app so Apple Silicon Macs will open it.
- `../.github/workflows/build.yml` builds both installers when you click **Run workflow** on the Actions tab. It does not run on every change: each build makes about 300 MB of installers, and GitHub's free storage runs out quickly (the first automatic build on `main` failed for that reason). The installers are deleted after 7 days. `--publish=never` stops electron-builder trying to create a GitHub release.

## Building the installers

1. Open the repo's **Actions** tab, click **Build desktop app**, then **Run workflow**. It takes about 5–10 minutes.
2. Click the run's **title** and download `mac-installer` and `windows-installer` from **Artifacts** under the flowchart. Each is a `.zip` containing the installer. Save them somewhere safe: GitHub deletes them after 7 days.
3. Bump `"version"` in `desktop/package.json` whenever you release a new installer.

If a run fails with "Artifact storage quota has been hit", delete old artifacts on GitHub (Actions → the run → Artifacts, or in other repos) and try again; usage is recalculated every 6–12 hours.

## First launch: one security prompt

The installers aren't signed with a paid certificate, so each operating system asks once:

- **Mac:** right-click the app → **Open** → **Open** (or System Settings → Privacy & Security → **Open Anyway**).
- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**.

## Things to know

- The desktop app keeps its own saved data, separate from any browser.
- Everything works offline, including the Excel export.
- **Ctrl + Shift + D** shows the debug log.
- The build uses Electron's default icon for now.

History: first built on 26 Sep 2026 in `yuki-kat/Kanban-Ticketing-System` (Actions run 36215646335) and moved here.
