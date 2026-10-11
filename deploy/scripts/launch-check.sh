#!/usr/bin/env bash
# shellcheck disable=SC2015  # ok/warn/fail only echo, so "A && ok || fail" is safe
# Is this server ready for real customers? Run it before switching a demo
# into a shop, and again after any change to the env files:
#
#   sudo /srv/tellcall/deploy/scripts/launch-check.sh
#
# [FAIL] lines must be fixed before taking real orders - real money, real
# customers' data. [warn] lines are strongly recommended. Changes nothing.
# Exits 1 while anything fails.
set -uo pipefail

ENV_FILE=${TELLCALL_ENV_FILE:-/etc/tellcall/backend.env}
BACKUP_ENV_FILE=${TELLCALL_BACKUP_ENV_FILE:-/etc/tellcall/backup.env}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

[[ $(id -u) -eq 0 ]] || { echo "Run as root (sudo) - it reads the env files and the database." >&2; exit 1; }
[[ -r $ENV_FILE ]] || { echo "Missing $ENV_FILE." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
# shellcheck source=/dev/null
[[ -r $BACKUP_ENV_FILE ]] && . "$BACKUP_ENV_FILE"
set +a
# shellcheck source=lib/backup-common.sh
. "$SCRIPT_DIR/lib/backup-common.sh"

failures=0
warnings=0
ok() { echo "  [ ok ] $1"; }
fail() { echo "  [FAIL] $1"; failures=$((failures + 1)); }
warn() { echo "  [warn] $1"; warnings=$((warnings + 1)); }
is_set() { [[ -n ${!1:-} && ${!1:-} != CHANGE_ME ]]; }

echo "Settings ($ENV_FILE)"
[[ ${NODE_ENV:-} == production ]] && ok "NODE_ENV is production" ||
  fail "NODE_ENV is '${NODE_ENV:-}', not production"
[[ ${DEMO_MODE:-} != true ]] && ok "DEMO_MODE is off" ||
  fail "DEMO_MODE=true - remove the line: it allows the payment sandbox and the nightly wipe"

if [[ ${ZARINPAL_MODE:-} == production ]]; then
  ok "Zarinpal is in production mode"
else
  fail "ZARINPAL_MODE is '${ZARINPAL_MODE:-}' - customers' payments would not be real"
fi
if is_set ZARINPAL_MERCHANT_ID && [[ $ZARINPAL_MERCHANT_ID != 00000000-0000-0000-0000-000000000000 ]]; then
  ok "Zarinpal merchant id is set"
else
  fail "ZARINPAL_MERCHANT_ID is empty or the demo placeholder - use the one from your Zarinpal panel"
fi

if is_set JWT_SECRET_KEY && is_set OTP_HASH_SECRET && [[ $JWT_SECRET_KEY != "$OTP_HASH_SECRET" ]]; then
  ok "JWT and OTP secrets are set, and differ"
else
  fail "JWT_SECRET_KEY / OTP_HASH_SECRET missing or equal - generate each with: openssl rand -hex 32"
fi

if is_set SMSIR_API_KEY && is_set SMSIR_OTP_TEMPLATE_ID; then
  ok "SMS (sms.ir) is configured"
else
  fail "SMSIR_API_KEY / SMSIR_OTP_TEMPLATE_ID empty - nobody can sign up or reset a password"
fi
is_set SMSIR_ACCOUNT_EXISTS_TEMPLATE_ID && ok "'account exists' SMS template is set" ||
  warn "SMSIR_ACCOUNT_EXISTS_TEMPLATE_ID empty - someone signing up with a registered number gets no SMS"
silent=()
for event in PLACED PAID SENT DELIVERED CANCELLED; do
  is_set "SMSIR_ORDER_${event}_TEMPLATE_ID" || silent+=("$event")
done
((${#silent[@]} == 0)) && ok "every order update has an SMS template" ||
  warn "No SMS template for order events: ${silent[*]} - customers are not told about those (SMSIR_ORDER_<EVENT>_TEMPLATE_ID)"

for url in BACKEND_URL FRONTEND_URL; do
  [[ ${!url:-} == https://* ]] && ok "$url is https" || fail "$url is '${!url:-}' - must be https://"
done
[[ -n ${TRUST_PROXY:-} ]] && ok "TRUST_PROXY is set" ||
  fail "TRUST_PROXY empty - behind nginx every visitor shares one IP for the rate limits"
[[ ${SWAGGER_ENABLED:-false} != true ]] && ok "API docs are off" ||
  warn "SWAGGER_ENABLED=true - the API docs are public"
is_set SENTRY_DSN && ok "Sentry error reporting is on" ||
  warn "SENTRY_DSN empty - server errors reach nobody but the journal"

missing=()
for key in SHOP_LEGAL_NAME SHOP_PHONE SHOP_ADDRESS SHOP_EMAIL; do is_set "$key" || missing+=("$key"); done
((${#missing[@]} == 0)) && ok "Shop details for the contact and legal pages are set" ||
  warn "Empty: ${missing[*]} - the contact and legal pages leave these out"
is_set ENAMAD_ID && is_set ENAMAD_CODE && ok "eNamad seal is set" ||
  warn "ENAMAD_ID / ENAMAD_CODE empty - no trust seal in the footer"

echo
echo "Backups"
if systemctl is-enabled --quiet tellcall-backup.timer 2>/dev/null; then
  ok "nightly backup timer is enabled"
else
  fail "tellcall-backup.timer is not enabled - sudo systemctl enable --now tellcall-backup.timer"
fi
is_set BACKUP_RCLONE_REMOTE && ok "off-site copy goes to $BACKUP_RCLONE_REMOTE" ||
  fail "BACKUP_RCLONE_REMOTE empty - the only backups are on the shop's own disk"
is_set BACKUP_HEALTHCHECK_URL && ok "backup failures are reported" ||
  warn "BACKUP_HEALTHCHECK_URL empty - a failing backup tells nobody"

newest=$(find "${BACKUP_DIR:-/var/backups/tellcall}" -maxdepth 1 -type f -name '*-db-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n 1)
if [[ -z $newest ]]; then
  fail "no backup yet - sudo systemctl start tellcall-backup"
else
  age_hours=$(( ($(date +%s) - ${newest%%.*}) / 3600 ))
  ((age_hours <= 26)) && ok "newest backup is ${age_hours}h old: $(basename "${newest#* }")" ||
    fail "newest backup is ${age_hours}h old - journalctl -u tellcall-backup -n 50"
fi
if systemctl is-enabled --quiet tellcall-demo-reset.timer 2>/dev/null; then
  fail "the nightly demo reset is still enabled - sudo systemctl disable --now tellcall-demo-reset.timer"
else
  ok "the nightly demo reset is off"
fi

echo
echo "Database"
demo_list=$(printf "'%s'," 09120000001 09120000002 09120000003 09120000004)
demo_users=$(sql_count "SELECT COUNT(*) FROM \`$DB_DATABASE\`.users WHERE mobile IN (${demo_list%,})" 2>/dev/null)
if [[ -z $demo_users ]]; then
  warn "could not read the users table to look for demo accounts"
elif ((demo_users > 0)); then
  fail "$demo_users demo account(s) (09120000001-4) still exist, with the password from the portfolio page - delete them"
else
  ok "no demo accounts"
fi

echo
echo "From the outside"
for target in "${FRONTEND_URL:-}" "${BACKEND_URL:-}/health"; do
  [[ $target == http* ]] || continue
  if curl -fsS -m 15 -o /dev/null "$target"; then
    ok "$target answers over a valid certificate"
  else
    fail "$target does not answer (or its certificate is not valid)"
  fi
done

echo
if ((failures > 0)); then
  echo "$failures to fix before taking real orders, $warnings recommended."
  exit 1
fi
echo "Ready for real customers ($warnings recommendation(s) above)."
