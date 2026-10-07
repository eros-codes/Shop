#!/usr/bin/env bash
# Put the public demo back to its seed data. Run nightly by
# tellcall-demo-reset.timer; can also be run by hand as root.
#
# Visitors are handed an admin password on the portfolio page, so anyone can
# delete products or place orders. This wipes all of it and starts again.
set -euo pipefail

APP_DIR=/srv/tellcall
ENV_FILE=/etc/tellcall/backend.env
APP_USER=tellcall

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

# The single guard that matters: this script drops the whole database.
if [[ ${DEMO_MODE:-} != "true" ]]; then
  echo "Refusing to reset: DEMO_MODE is not true in $ENV_FILE." >&2
  echo "This would wipe a real shop's orders and customers." >&2
  exit 1
fi

echo "==> Stopping the API"
systemctl stop tellcall-api

# Root connects through the local socket (auth_socket on Ubuntu), so no
# database password is needed here. The application user keeps its grants:
# MySQL stores them by database name, not by the database itself.
echo "==> Recreating database $DB_DATABASE"
mysql -e "DROP DATABASE IF EXISTS \`$DB_DATABASE\`;
          CREATE DATABASE \`$DB_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "==> Clearing uploaded images"
find "$UPLOAD_DIR" -mindepth 1 -delete 2>/dev/null || true
install -d -o "$APP_USER" -g "$APP_USER" "$UPLOAD_DIR"

echo "==> Migrating and seeding"
runuser -u "$APP_USER" -- bash -c "cd $APP_DIR/backend && set -a && . $ENV_FILE && set +a && npm run migration:run && npm run seed:demo"

echo "==> Starting the API"
systemctl start tellcall-api
echo "==> Demo reset complete."
