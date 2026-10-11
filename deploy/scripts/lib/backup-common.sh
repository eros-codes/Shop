# shellcheck shell=bash
# Shared by backup.sh and restore.sh. Sourced, never run on its own.
# Expects the backend env (DB_DATABASE, ...) and backup.env to be loaded.

DB_LOCK_FILE=${TELLCALL_DB_LOCK:-/run/lock/tellcall-db.lock}

# The MySQL tools, as root over the local socket (auth_socket on Ubuntu) -
# or with the credentials in BACKUP_MYSQL_DEFAULTS_FILE when the database
# lives elsewhere. That option has to come first on the command line.
mysql_cmd() {
  local tool=$1
  shift
  if [[ -n ${BACKUP_MYSQL_DEFAULTS_FILE:-} ]]; then
    "$tool" --defaults-extra-file="$BACKUP_MYSQL_DEFAULTS_FILE" "$@"
  else
    "$tool" "$@"
  fi
}

# Shared with reset-demo.sh and restore.sh: whichever comes second waits
# (up to an hour) instead of reading a database another is dropping.
take_db_lock() {
  exec {DB_LOCK_FD}>"$DB_LOCK_FILE"
  if ! flock -w 3600 "$DB_LOCK_FD"; then
    echo "Another database job has held $DB_LOCK_FILE for an hour - giving up." >&2
    return 1
  fi
}

release_db_lock() {
  if [[ -n ${DB_LOCK_FD:-} ]]; then
    flock -u "$DB_LOCK_FD" || true
    exec {DB_LOCK_FD}>&-
    DB_LOCK_FD=
  fi
}

# A dump is whole when the gzip stream is intact and mysqldump got as far
# as writing its closing line - a full disk or a killed process leaves a
# file that looks fine by its size alone.
check_dump_file() {
  local file=$1
  [[ -s $file ]] || { echo "Dump $file is missing or empty." >&2; return 1; }
  gzip -t "$file" || { echo "Dump $file is not a whole gzip file." >&2; return 1; }
  if ! gzip -dc "$file" | tail -n 1 | grep -q '^-- Dump completed'; then
    echo "Dump $file stops part way (no '-- Dump completed' at the end)." >&2
    return 1
  fi
}

sql_count() {
  mysql_cmd mysql -N -B -e "$1"
}

# Loads a dump into a throwaway database next to the real one, counts what
# came back, and drops it again. Proves the file restores without going
# anywhere near the live data. With "strict" (a dump taken a moment ago)
# its tables must match the live database exactly; an older dump may
# predate a migration, so there it is only reported.
restore_check() {
  local file=$1 strict=${2:-strict}
  local scratch="${DB_DATABASE}_restore_check"

  mysql_cmd mysql -e "DROP DATABASE IF EXISTS \`$scratch\`;
    CREATE DATABASE \`$scratch\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

  if ! gzip -dc "$file" | mysql_cmd mysql --default-character-set=utf8mb4 "$scratch"; then
    mysql_cmd mysql -e "DROP DATABASE IF EXISTS \`$scratch\`;" || true
    echo "The dump did not load into a scratch database." >&2
    return 1
  fi

  local tables live_tables migration summary=""
  tables=$(sql_count "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$scratch'")
  live_tables=$(sql_count "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_DATABASE'")
  migration=$(sql_count "SELECT name FROM \`$scratch\`.migrations ORDER BY id DESC LIMIT 1" 2>/dev/null || echo "?")
  for table in users order products wallets; do
    if [[ $(sql_count "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$scratch' AND table_name = '$table'") == 1 ]]; then
      summary+=" $table=$(sql_count "SELECT COUNT(*) FROM \`$scratch\`.\`$table\`")"
    fi
  done
  mysql_cmd mysql -e "DROP DATABASE \`$scratch\`;"

  echo "    restored: $tables tables (live has $live_tables), last migration $migration,$summary"
  if [[ $tables -eq 0 ]]; then
    echo "The dump restored to an empty database." >&2
    return 1
  fi
  if [[ $tables -ne $live_tables ]]; then
    if [[ $strict == strict ]]; then
      echo "The restored copy does not have the tables the live database has." >&2
      return 1
    fi
    echo "    (table count differs from live - expected if migrations ran since this dump)"
  fi
}

rclone_cmd() {
  command -v rclone > /dev/null || { echo "rclone is not installed (apt install rclone)." >&2; return 1; }
  rclone --config "${BACKUP_RCLONE_CONFIG:-/etc/tellcall/rclone.conf}" "$@"
}

# Keeps the newest $2 files starting with $1 (names carry a sortable
# timestamp) and deletes the rest.
prune() {
  local prefix=$1 keep=$2
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "$prefix*.gz" | sort -r | tail -n +"$((keep + 1))" |
    while read -r old; do
      echo "    removing old $(basename "$old")"
      rm -f -- "$old"
    done
}

# A dead man's switch (healthchecks.io, Uptime Kuma push, ...): pinged on
# every success, and on /fail when it goes wrong. Never fails the backup.
ping_monitor() {
  [[ -n ${BACKUP_HEALTHCHECK_URL:-} ]] || return 0
  local url=$BACKUP_HEALTHCHECK_URL
  [[ $1 == fail ]] && url="$url/fail"
  curl -fsS -m 10 --retry 3 -o /dev/null "$url" || echo "(could not reach the backup monitor)" >&2
}
