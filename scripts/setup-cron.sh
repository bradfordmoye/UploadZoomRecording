#!/usr/bin/env bash
# Installs (or removes) the weekly cron jobs:
#   Mastery    — Mondays  at 3:00 PM
#   Essentials — Tuesdays at 2:00 PM
#
# Usage:
#   bash scripts/setup-cron.sh            # install / update
#   bash scripts/setup-cron.sh --remove   # uninstall
#
# Times are in CRON_TIMEZONE (default America/New_York). On Linux (cronie/Vixie)
# CRON_TZ handles this; on macOS cron ignores CRON_TZ and uses the system clock,
# so make sure the Mac is set to Eastern time.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
TZ_NAME="${CRON_TIMEZONE:-America/New_York}"
BEGIN="# >>> zoom-recording-sync >>>"
END="# <<< zoom-recording-sync <<<"

current="$(crontab -l 2>/dev/null || true)"
# Strip any previous block we installed.
cleaned="$(printf '%s\n' "$current" | sed "/^${BEGIN}\$/,/^${END}\$/d")"

if [[ "${1:-}" == "--remove" ]]; then
  printf '%s\n' "$cleaned" | sed '/^$/N;/^\n$/D' | crontab -
  echo "Removed zoom-recording-sync cron jobs."
  exit 0
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Error: node not found on PATH. Install Node.js 18+ first." >&2
  exit 1
fi
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  echo "Warning: $PROJECT_DIR/.env not found — copy .env.example to .env and fill it in." >&2
fi

mkdir -p "$PROJECT_DIR/logs"

block="$BEGIN
CRON_TZ=$TZ_NAME
# Mastery: Mondays 3:00 PM
0 15 * * 1 cd \"$PROJECT_DIR\" && TZ=$TZ_NAME \"$NODE_BIN\" scripts/mastery.js >> logs/mastery.log 2>&1
# Essentials: Tuesdays 2:00 PM
0 14 * * 2 cd \"$PROJECT_DIR\" && TZ=$TZ_NAME \"$NODE_BIN\" scripts/essentials.js >> logs/essentials.log 2>&1
$END"

printf '%s\n%s\n' "$cleaned" "$block" | sed '/./,$!d' | crontab -

echo "Installed cron jobs:"
crontab -l | sed -n "/^${BEGIN}\$/,/^${END}\$/p"
echo
echo "Logs: $PROJECT_DIR/logs/{mastery,essentials}.log"
