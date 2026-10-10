#!/usr/bin/env bash
# Run npm audit in every package of the repo and print one compact table per package.
# Usage: audit.sh [repo-dir, default .]
# Columns: severity, package, direct dependency?, fix (yes = npm audit fix, major:<pkg>@<ver> = breaking, no = none), advisory.
set -u
repo=${1:-.}
for lock in package-lock.json app/package-lock.json server/package-lock.json tests/package-lock.json; do
  [ -f "$repo/$lock" ] || continue
  dir=$(dirname "$lock")
  echo "=== $dir"
  (cd "$repo/$dir" && npm audit --json 2>/dev/null) | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      let j; try { j = JSON.parse(s) } catch { console.log("  npm audit failed (no network or no node_modules?)"); return }
      const m = j.metadata?.vulnerabilities || {};
      console.log(`  total ${m.total ?? 0} (critical ${m.critical ?? 0}, high ${m.high ?? 0}, moderate ${m.moderate ?? 0}, low ${m.low ?? 0})`);
      for (const [name, v] of Object.entries(j.vulnerabilities || {})) {
        const fix = v.fixAvailable === true ? "yes" : v.fixAvailable ? `major:${v.fixAvailable.name}@${v.fixAvailable.version}` : "no";
        const via = v.via.map(x => typeof x === "object" ? x.title : `via ${x}`)[0] || "";
        console.log(`  ${v.severity.padEnd(8)} ${name.padEnd(26)} direct=${String(v.isDirect).padEnd(5)} fix=${fix.padEnd(14)} ${via}`);
      }
    })'
done
