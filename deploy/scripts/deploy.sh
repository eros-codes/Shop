#!/usr/bin/env bash
# Build and release tellcall on the server. Run as root:
#   sudo /srv/tellcall/deploy/scripts/deploy.sh
#
# Builds run as the unprivileged `tellcall` user; root is only needed to
# restart the service at the end.
set -euo pipefail

APP_DIR=/srv/tellcall
ENV_FILE=/etc/tellcall/backend.env
APP_USER=tellcall

as_app() { runuser -u "$APP_USER" -- bash -c "$1"; }

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }
[[ -r $ENV_FILE ]] || { echo "Missing $ENV_FILE - see deploy/env/backend.env.example." >&2; exit 1; }

if [[ -d $APP_DIR/.git ]]; then
  echo "==> Pulling latest code"
  as_app "cd $APP_DIR && git pull --ff-only"
fi

# Order matters here. `npm ci` installs devDependencies (the Nest CLI, Vite,
# TypeScript) only while NODE_ENV is *not* production, so the env file is
# loaded strictly inside the one step that needs it - the migrations - and
# never leaks into the builds around it.

echo "==> Backend: install and build"
as_app "cd $APP_DIR/backend && npm ci --no-audit --no-fund && npm run build"

echo "==> Backend: database migrations"
# Production never syncs the schema on its own, so this step is the only
# thing that brings the database up to date.
as_app "cd $APP_DIR/backend && set -a && . $ENV_FILE && set +a && npm run migration:run"

echo "==> Storefront: build"
as_app "cd $APP_DIR/front && npm ci --no-audit --no-fund && npm run build"

echo "==> Admin panel: build"
as_app "cd $APP_DIR/admin && npm ci --no-audit --no-fund && npm run build"

echo "==> Restarting the API"
systemctl restart tellcall-api

echo "==> Waiting for the API to answer"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/health; then
    echo "==> Deployed."
    exit 0
  fi
  sleep 1
done
echo "The API did not come up - check: journalctl -u tellcall-api -n 80" >&2
exit 1
