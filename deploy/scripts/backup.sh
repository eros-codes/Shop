#!/usr/bin/env bash
# Back up the shop: the database, and the uploaded product images.
#
#   sudo /srv/tellcall/deploy/scripts/backup.sh                 # nightly, by tellcall-backup.timer
#   sudo /srv/tellcall/deploy/scripts/backup.sh --label pre-deploy --db-only
#
# Every dump is checked before it is trusted - the gzip stream is whole,
# mysqldump got to its last line, and (unless BACKUP_VERIFY=false) it is
# actually loaded into a scratch database and counted. A backup that has
# never been restored is only a hope. Then it is copied off the server,
# because a backup on the same disk dies with the disk.
#
# Settings: /etc/tellcall/backup.env (see deploy/env/backup.env.example).
set -euo pipefail

ENV_FILE=${TELLCALL_ENV_FILE:-/etc/tellcall/backend.env}
BACKUP_ENV_FILE=${TELLCALL_BACKUP_ENV_FILE:-/etc/tellcall/backup.env}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

label=daily
with_uploads=true
while [[ $# -gt 0 ]]; do
  case $1 in
    --label) label=$2; shift 2 ;;
    --db-only) with_uploads=false; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ $label =~ ^[a-z0-9-]+$ ]] || { echo "A label is lower-case letters, digits and dashes." >&2; exit 2; }

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

BACKUP_DIR=${BACKUP_DIR:-/var/backups/tellcall}
BACKUP_KEEP=${BACKUP_KEEP:-14}
BACKUP_VERIFY=${BACKUP_VERIFY:-true}
BACKUP_REMOTE_KEEP_DAYS=${BACKUP_REMOTE_KEEP_DAYS:-30}

# Whatever the outcome, the monitor hears about it: a failure at once, and
# a backup that silently stopped running as a missing ping.
finished=false
report() {
  if ! $finished; then
    echo "!! Backup FAILED - see the lines above." >&2
    ping_monitor fail
  fi
}
trap report EXIT

# Customer names, numbers and addresses are in here: root's eyes only.
umask 077
install -d -m 700 "$BACKUP_DIR"
# Leftovers of a run that was killed half way.
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -delete

# One database job at a time - the nightly demo reset drops the database
# this is reading.
take_db_lock

# A brand-new server (first deploy, or restoring onto a fresh machine):
# nothing to keep yet, and that is not a failure.
if [[ $(sql_count "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_DATABASE'") -eq 0 ]]; then
  echo "==> $DB_DATABASE has no tables yet - nothing to back up."
  finished=true
  exit 0
fi

stamp=$(date +%Y%m%d-%H%M%S)
dump="$BACKUP_DIR/$label-db-$stamp.sql.gz"
echo "==> Dumping $DB_DATABASE to $dump"
# --single-transaction: a consistent snapshot without locking the shop.
# No --databases, so the dump carries no CREATE DATABASE / USE and can be
# loaded under any name - the restore check depends on that.
mysql_cmd mysqldump \
  --single-transaction --quick --hex-blob \
  --default-character-set=utf8mb4 \
  --no-tablespaces --set-gtid-purged=OFF \
  "$DB_DATABASE" | gzip -6 > "$dump.partial"
mv "$dump.partial" "$dump"
check_dump_file "$dump"
echo "    $(du -h "$dump" | cut -f1)"

if [[ $BACKUP_VERIFY == true ]]; then
  echo "==> Restoring it into a scratch database to prove it loads"
  restore_check "$dump"
fi

files=("$dump")
if $with_uploads && [[ -n ${UPLOAD_DIR:-} && -d $UPLOAD_DIR ]]; then
  images="$BACKUP_DIR/$label-uploads-$stamp.tar.gz"
  echo "==> Archiving uploaded images to $images"
  tar -C "$(dirname "$UPLOAD_DIR")" -czf "$images.partial" "$(basename "$UPLOAD_DIR")"
  mv "$images.partial" "$images"
  gzip -t "$images"
  files+=("$images")
fi

release_db_lock

if [[ -n ${BACKUP_RCLONE_REMOTE:-} ]]; then
  echo "==> Copying off the server to $BACKUP_RCLONE_REMOTE"
  for file in "${files[@]}"; do
    rclone_cmd copy "$file" "$BACKUP_RCLONE_REMOTE/"
  done
  # Only after today's copy arrived, so the remote is never left empty.
  rclone_cmd delete --min-age "${BACKUP_REMOTE_KEEP_DAYS}d" "$BACKUP_RCLONE_REMOTE/"
else
  echo "!! BACKUP_RCLONE_REMOTE is not set: this backup lives on the same disk as the shop." >&2
fi

# The newest BACKUP_KEEP of each kind stay. By count, not by age: if
# backups ever stop, age-based cleanup would go on to delete the last good
# ones too.
prune "$label-db-" "$BACKUP_KEEP"
prune "$label-uploads-" "$BACKUP_KEEP"

finished=true
ping_monitor ok
echo "==> Backup complete."
