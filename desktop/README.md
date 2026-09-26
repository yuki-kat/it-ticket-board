# IT Ticket Board — desktop app

The ticket board packaged as a desktop app for **Windows** (`.exe` installer) and **Mac** (`.dmg`, Apple Silicon and Intel), built in the cloud by GitHub Actions.

**Status: parked.** This lives on the `desktop-app` branch and is not merged into `main`. The build only runs on `main`, so nothing is built until this branch is merged.

## How it works

- The app page is the repo's own `../index.html`. `scripts/copyApp.js` copies it into `desktop/app/` before every build or local run, so there's only one file to edit and the desktop app always matches it. (`desktop/app/` isn't committed.)
- `main.js` opens that page in a desktop window. Links to websites and email open in your normal browser or mail app.
- `scripts/afterPackSign.js` ad-hoc signs the Mac app so Apple Silicon Macs will open it.
- `../.github/workflows/build.yml` builds both installers whenever `index.html` or `desktop/` changes on `main`, or when you click **Run workflow** on the Actions tab. `--publish=never` stops electron-builder trying to create a GitHub release.

## Picking it up again

1. Open a pull request from `desktop-app` into `main` and merge it. The first build starts automatically, taking about 5–10 minutes.
2. Open the **Actions** tab, click the run's **title**, and download `mac-installer` and `windows-installer` from **Artifacts** under the flowchart. Each is a `.zip` containing the installer.
3. Bump `"version"` in `desktop/package.json` whenever you release a new installer.

## First launch: one security prompt

The installers aren't signed with a paid certificate, so each operating system asks once:

- **Mac:** right-click the app → **Open** → **Open** (or System Settings → Privacy & Security → **Open Anyway**).
- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**.

## Things to know

- The desktop app keeps its own saved data, separate from any browser.
- Excel export needs internet. Everything else works offline.
- **Ctrl + Shift + D** shows the debug log.
- The build uses Electron's default icon for now.

History: first built on 26 Sep 2026 in `yuki-kat/Kanban-Ticketing-System` (Actions run 36215646335) and moved here.
