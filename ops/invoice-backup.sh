#!/usr/bin/env bash
#
# invoice-backup.sh — nightly encrypted backup of the invoice-saas Postgres
# database and uploaded assets (business logos). Backlog 0.3.5 / L3.2.1;
# procedure and rationale in docs/backup-and-secrets-runbook.md §2.
#
# The database is dumped, compressed and age-encrypted in a single pipe so no
# plaintext ever hits disk. The uploads directory is tarred and encrypted the
# same way. Both encrypted artefacts are optionally shipped off-box with rclone,
# then local copies older than the retention window are pruned.
#
# Everything is driven by environment variables so the one script runs unchanged
# on the VPS (cron) and locally (the L3.2.2 dry-run / L3.2.3 restore test):
#
#   DATABASE_URL            (required) Postgres connection string to dump.
#   AGE_BACKUP_RECIPIENT    age public key ("age1…") to encrypt to. Either this
#   AGE_BACKUP_RECIPIENTS_FILE   or a file of recipients (age -R) is required.
#   BACKUP_DEST             Local output dir. Default /var/backups/invoice-saas.
#   UPLOADS_TAR_BASE        Dir to tar from.  Default /srv/invoice-saas/apps/api.
#   UPLOADS_TAR_PATH        Path under it.    Default var/uploads.
#   BACKUP_REMOTE           rclone remote, e.g. "r2:invoice-saas". Unset → the
#                           off-box copy step is skipped (local-only dry-run).
#   BACKUP_RETAIN_DAYS      Prune local artefacts older than this. Default 7.
#   PGDUMP                  pg_dump binary. Default "pg_dump" (PATH). Set this on
#                           macOS, e.g. /Library/PostgreSQL/17/bin/pg_dump.
#
# Exit non-zero on any failure so the cron wrapper can alert (runbook §6).

set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DEST="${BACKUP_DEST:-/var/backups/invoice-saas}"
UPLOADS_TAR_BASE="${UPLOADS_TAR_BASE:-/srv/invoice-saas/apps/api}"
UPLOADS_TAR_PATH="${UPLOADS_TAR_PATH:-var/uploads}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
PGDUMP="${PGDUMP:-pg_dump}"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# --- resolve the age recipient flag (a key string, or a file of them) ----------
age_recipient_args=()
if [ -n "${AGE_BACKUP_RECIPIENT:-}" ]; then
  age_recipient_args=(-r "$AGE_BACKUP_RECIPIENT")
elif [ -n "${AGE_BACKUP_RECIPIENTS_FILE:-}" ]; then
  [ -f "$AGE_BACKUP_RECIPIENTS_FILE" ] || die "AGE_BACKUP_RECIPIENTS_FILE not found: $AGE_BACKUP_RECIPIENTS_FILE"
  age_recipient_args=(-R "$AGE_BACKUP_RECIPIENTS_FILE")
else
  die "set AGE_BACKUP_RECIPIENT (age1… public key) or AGE_BACKUP_RECIPIENTS_FILE"
fi

command -v "$PGDUMP" >/dev/null 2>&1 || die "pg_dump not found (set PGDUMP=/path/to/pg_dump)"
command -v age >/dev/null 2>&1 || die "age not found (https://github.com/FiloSottile/age)"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DEST"

db_out="$BACKUP_DEST/db-$STAMP.sql.gz.age"
uploads_out="$BACKUP_DEST/uploads-$STAMP.tar.gz.age"

# --- database: dump | gzip | encrypt, one pipe, no plaintext on disk -----------
log "dumping database → $db_out"
"$PGDUMP" --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  | gzip -9 \
  | age "${age_recipient_args[@]}" -o "$db_out"
log "database artefact: $(du -h "$db_out" | cut -f1)"

# --- uploaded assets: tar | encrypt ------------------------------------------
if [ -d "$UPLOADS_TAR_BASE/$UPLOADS_TAR_PATH" ]; then
  log "archiving $UPLOADS_TAR_BASE/$UPLOADS_TAR_PATH → $uploads_out"
  tar -C "$UPLOADS_TAR_BASE" -czf - "$UPLOADS_TAR_PATH" \
    | age "${age_recipient_args[@]}" -o "$uploads_out"
  log "uploads artefact: $(du -h "$uploads_out" | cut -f1)"
else
  log "no uploads dir at $UPLOADS_TAR_BASE/$UPLOADS_TAR_PATH — skipping asset archive"
fi

# --- ship off-box (skipped when BACKUP_REMOTE is unset) ------------------------
if [ -n "$BACKUP_REMOTE" ]; then
  command -v rclone >/dev/null 2>&1 || die "rclone not found but BACKUP_REMOTE is set"
  log "rclone copy $BACKUP_DEST → $BACKUP_REMOTE/"
  rclone copy "$BACKUP_DEST" "$BACKUP_REMOTE/" --immutable
else
  log "BACKUP_REMOTE unset — off-box copy skipped (local-only run)"
fi

# --- prune local copies older than the retention window ----------------------
log "pruning local artefacts older than ${BACKUP_RETAIN_DAYS}d in $BACKUP_DEST"
find "$BACKUP_DEST" -type f -name '*.age' -mtime "+${BACKUP_RETAIN_DAYS}" -print -delete || true

log "backup complete ($STAMP)"
