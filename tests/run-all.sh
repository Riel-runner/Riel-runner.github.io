#!/usr/bin/env bash
# Runs every browser test suite; exits 1 if ANY check fails.
# Usage (from anywhere):  bash tests/run-all.sh
# Needs Node.js and Google Chrome. Override the Chrome path with:
#   CHROME="/path/to/chrome" bash tests/run-all.sh
T="$(cd "$(dirname "$0")" && pwd)"            # this tests/ folder
REPO="${1:-$T/..}"                             # repo root (default: parent of tests/)
C="${CHROME:-C:/Program Files/Google/Chrome/Application/chrome.exe}"
cd "$REPO" || exit 1

status=0
for t in intro death touch lives shop store ai soak jump save laser kinds; do
  out="$(node "$T/$t-test.js" . "$C")"
  pass=$(grep -c '^PASS' <<<"$out"); fail=$(grep -c -E '^FAIL|ERROR|no result' <<<"$out")
  printf '%-6s %3d pass %3d fail\n' "$t" "$pass" "$fail"
  if [ "$fail" -ne 0 ] || [ "$pass" -eq 0 ]; then
    grep -E '^FAIL|ERROR|no result' <<<"$out" | sed 's/^/       /'
    status=1
  fi
done

pages="$(node "$T/check.js" . "$C")"
okp=$(grep -c '^OK' <<<"$pages")
printf '%-6s %3d / 7 pages load cleanly\n' pages "$okp"
[ "$okp" -eq 7 ] || { grep -v '^OK' <<<"$pages" | sed 's/^/       /'; status=1; }

[ $status -eq 0 ] && echo "ALL PASSED" || echo "SOME CHECKS FAILED"
exit $status
