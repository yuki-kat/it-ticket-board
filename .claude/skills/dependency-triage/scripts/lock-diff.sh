#!/usr/bin/env bash
# Show which packages each package-lock.json adds, removes or changes compared with a base commit,
# so you can check a dependency fix touched only what you meant it to.
# Usage: lock-diff.sh [repo-dir, default .] [base, default origin/main]
set -u
repo=${1:-.}; base=${2:-origin/main}
cd "$repo" || exit 1
for lock in package-lock.json app/package-lock.json server/package-lock.json tests/package-lock.json; do
  [ -f "$lock" ] || continue
  old=$(git show "$base:$lock" 2>/dev/null) || old='{"packages":{}}'
  printf '%s' "$old" | LOCK="$lock" node -e '
    const fs = require("fs");
    const before = JSON.parse(fs.readFileSync(0, "utf8")).packages || {};
    const after = JSON.parse(fs.readFileSync(process.env.LOCK, "utf8")).packages || {};
    const name = k => k.replace(/^.*node_modules\//, "");
    const lines = [];
    for (const k of Object.keys({ ...before, ...after })) {
      if (!k) continue;
      const a = before[k]?.version, b = after[k]?.version;
      if (a === b) continue;
      lines.push(!a ? `  + ${name(k)} ${b}` : !b ? `  - ${name(k)} ${a}` : `  ~ ${name(k)} ${a} -> ${b}`);
    }
    if (lines.length) console.log(`=== ${process.env.LOCK}\n${lines.sort().join("\n")}`);
  '
done
