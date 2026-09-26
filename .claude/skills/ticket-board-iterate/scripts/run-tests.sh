#!/usr/bin/env bash
# Run the IT Ticket Board browser tests and list the tests that failed.
#
#   bash <skill>/scripts/run-tests.sh <repo> [playwright args, e.g. explore.spec.ts]
#
# On a Mac with Google Chrome this is the same as `cd tests && npm test`. In a cloud session the
# Playwright version the repo pins wants a Chromium build that isn't installed, so the tests are
# pointed at the preinstalled one through a throwaway config file that is removed afterwards.
set -u
repo="${1:?usage: run-tests.sh <repo> [playwright args]}"; shift
cd "$repo/tests" || exit 2

if [ ! -d node_modules ]; then PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund >/dev/null || exit 2; fi
rm -rf test-results

if [ -x /opt/pw-browsers/chromium ]; then
  cat > pw.local.config.ts <<'EOF'
import base from './playwright.config'
export default { ...base, use: { ...base.use, channel: undefined, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } }
EOF
  trap 'rm -f pw.local.config.ts' EXIT
  CI=1 npx playwright test -c pw.local.config.ts --reporter=line --retries=0 "$@" 2>&1 | grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped)'
else
  npx playwright test --reporter=line "$@" 2>&1 | grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped)'
fi

if [ -d test-results ] && [ -n "$(ls test-results)" ]; then
  echo "Failed (see tests/test-results/ for traces):"
  ls test-results | sed 's/-retry.*//' | sort -u | sed 's/^/  /'
fi
