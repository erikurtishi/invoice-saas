#!/usr/bin/env bash
#
# invoice-restore.sh — restore an age-encrypted database artefact produced by
# invoice-backup.sh into a target Postgres database, then run migrations.
# Backlog L3.2.3 / V1.5.2; procedure in docs/backup-and-secrets-runbook.md §3.
#
# "A backup that has never been restored is not a backup." Run this quarterly and
# after any non-additive migration, into a scratch/staging DB — never the live one.
#
#   Usage:  invoice-restore.sh <db-STAMP.sql.gz.age>
#
#   AGE_IDENTITY_FILE      (required) age private key file to decrypt with. This
#                          key never lives on the VPS — password manager +
#                          restore operators' laptops only (runbook §4).
#   TARGET_DATABASE_URL    (required) DB to restore INTO. Must already exist and
#                          should be empty/scratch — pg_restore --clean drops
#                          objects it finds.
#   PGRESTORE              pg_restore binary. Default "pg_restore" (PATH).
#   RUN_MIGRATIONS         "1" (default) runs db:migrate:deploy after restore;
#                          set "0" to skip (e.g. restoring onto older code).

set -euo pipefail

ARTEFACT="${1:?usage: invoice-restore.sh <db-STAMP.sql.gz.age>}"
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE (age private key) is required}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
PGRESTORE="${PGRESTORE:-pg_restore}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ -f "$ARTEFACT" ] || die "artefact not found: $ARTEFACT"
[ -f "$AGE_IDENTITY_FILE" ] || die "identity file not found: $AGE_IDENTITY_FILE"
command -v age >/dev/null 2>&1 || die "age not found"
command -v "$PGRESTORE" >/dev/null 2>&1 || die "pg_restore not found (set PGRESTORE=/path/to/pg_restore)"

log "restoring $ARTEFACT → $TARGET_DATABASE_URL"
age -d -i "$AGE_IDENTITY_FILE" "$ARTEFACT" \
  | gunzip \
  | "$PGRESTORE" --clean --if-exists --no-owner -d "$TARGET_DATABASE_URL"
log "pg_restore complete"

if [ "$RUN_MIGRATIONS" = "1" ]; then
  log "applying migrations (db:migrate:deploy)"
  DATABASE_URL="$TARGET_DATABASE_URL" npm run db:migrate:deploy -w @invoice-saas/api
else
  log "RUN_MIGRATIONS=0 — skipping migrations"
fi

log "restore complete — smoke test now: log in, open the invoice list, download one PDF"
