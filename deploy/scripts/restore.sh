#!/usr/bin/env bash
# Put a backup back.
#
#   sudo restore.sh --check daily-db-20261011-033000.sql.gz
#       Proves a backup loads, in a scratch database. Touches nothing live.
#
#   sudo restore.sh daily-db-20261011-033000.sql.gz [--uploads daily-uploads-....tar.gz]
#       Replaces the live database (and the images) with the backup. Asks
#       for the database name first; --yes skips that, for scripts.
#
# Before replacing anything it backs up what is there now (label
# "pre-restore"), so a restore of the wrong file can itself be undone.
# Then it brings the schema up to the deployed code with the migrations,
# the same as deploy.sh does.
set -euo pipefail

APP_DIR=${TELLCALL_APP_DIR:-/srv/tellcall}
APP_USER=tellcall
ENV_FILE=${TELLCALL_ENV_FILE:-/etc/tellcall/backend.env}
BACKUP_ENV_FILE=${TELLCALL_BACKUP_ENV_FILE:-/etc/tellcall/backup.env}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

check_only=false
assume_yes=false
dump=
uploads=
while [[ $# -gt 0 ]]; do
  case $1 in
    --check) check_only=true; shift ;;
    --yes) assume_yes=true; shift ;;
    --uploads) uploads=$2; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) [[ -z $dump ]] || usage; dump=$1; shift ;;
  esac
done
[[ -n $dump ]] || usage

[[ $(id -u) -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }
[[ -r $ENV_FILE ]] || { echo "Missing $ENV_FILE." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
# shellcheck source=/dev/null
[[ -r $BACKUP_ENV_FILE ]] && . "$BACKUP_ENV_FILE"
set +a
# shellcheck source=lib/backup-common.sh
. "$SCRIPT_DIR/lib/backup-common.sh"

echo "==> Checking $dump"
check_dump_file "$dump"
if [[ -n $uploads ]] && ! { [[ -s $uploads ]] && gzip -t "$uploads"; }; then
  echo "$uploads is not a whole archive." >&2
  exit 1
fi

if $check_only; then
  take_db_lock
  restore_check "$dump" loose
  echo "==> The backup loads. Nothing live was changed."
  exit 0
fi

if ! $assume_yes; then
  [[ -t 0 ]] || { echo "Not a terminal: pass --yes to restore without asking." >&2; exit 1; }
  echo "This REPLACES the live database '$DB_DATABASE'${uploads:+ and the uploaded images} with the backup."
  read -r -p "Type the database name to go ahead: " answer
  [[ $answer == "$DB_DATABASE" ]] || { echo "Not restoring." >&2; exit 1; }
fi

# What is there now, kept first. Skipped on a brand-new server, where the
# database is empty and there is nothing to keep (backup.sh says so).
echo "==> Backing up the current state first"
if [[ -n $uploads ]]; then
  "$SCRIPT_DIR/backup.sh" --label pre-restore
else
  "$SCRIPT_DIR/backup.sh" --label pre-restore --db-only
fi

take_db_lock

api_stopped=false
# shellcheck disable=SC2329  # run by the EXIT trap
restart_api() {
  if $api_stopped; then
    echo "==> Starting the API"
    systemctl start tellcall-api || true
  fi
}
trap restart_api EXIT

echo "==> Stopping the API"
systemctl stop tellcall-api
api_stopped=true

echo "==> Loading the backup into $DB_DATABASE"
mysql_cmd mysql -e "DROP DATABASE IF EXISTS \`$DB_DATABASE\`;
  CREATE DATABASE \`$DB_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gzip -dc "$dump" | mysql_cmd mysql --default-character-set=utf8mb4 "$DB_DATABASE"

if [[ -n $uploads ]]; then
  echo "==> Restoring uploaded images to $UPLOAD_DIR"
  parent=$(dirname "$UPLOAD_DIR")
  unpacked=$(mktemp -d "$parent/.restore-XXXXXX")
  tar -xzf "$uploads" -C "$unpacked"
  # The archive holds one folder - whatever the uploads folder was called
  # on the server it came from.
  inner=$(find "$unpacked" -mindepth 1 -maxdepth 1 -type d | head -n 1)
  [[ -n $inner ]] || { echo "$uploads has no folder in it." >&2; exit 1; }
  if [[ -d $UPLOAD_DIR ]]; then
    mv "$UPLOAD_DIR" "$UPLOAD_DIR.before-restore-$(date +%Y%m%d-%H%M%S)"
  fi
  mv "$inner" "$UPLOAD_DIR"
  rmdir "$unpacked"
  chown -R "$APP_USER:$APP_USER" "$UPLOAD_DIR"
fi

release_db_lock

# An older backup may predate a migration the deployed code relies on.
echo "==> Bringing the schema up to the deployed code"
runuser -u "$APP_USER" -- bash -c "cd $APP_DIR/backend && set -a && . $ENV_FILE && set +a && npm run migration:run"

systemctl start tellcall-api
api_stopped=false

echo "==> Waiting for the API to answer"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3000}/health"; then
    echo "==> Restored."
    exit 0
  fi
  sleep 1
done
echo "The API did not come up - check: journalctl -u tellcall-api -n 80" >&2
exit 1
