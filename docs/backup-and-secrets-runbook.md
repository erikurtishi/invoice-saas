# Backup & secrets runbook (Epic X.4.7)

Ops procedure, **not yet executed** — there is no server to run it on. Development is
entirely local (decision D1); deployment is a Hostinger VPS, provisioned later. This
document is written now so the steps exist the day the VPS does; `0.3.1` (deployment)
wires the cron and the secret store as part of standing the box up.

Companion to `puppeteer-hosting-runbook.md` (Chrome deps on the same VPS).

---

## 1. What has to be backed up

| Data | Where | Backup method |
| --- | --- | --- |
| Postgres database (`invoice_saas`) | VPS Postgres 17 | `pg_dump`, nightly (§2) |
| Uploaded assets (`var/uploads/` — business logos only; PDFs are generated on demand, never stored) | VPS filesystem | `tar` + rsync, nightly (§3) |
| `.env` (API secrets) | VPS filesystem, `0600` | Stored **once** in the password manager, not in the nightly job (§4) |
| Prisma migration history | Git (`apps/api/prisma/migrations/`) | Already version-controlled |

The database is the only thing whose loss is unrecoverable. Everything else is
re-derivable (assets are re-uploadable by tenants; `.env` is re-creatable from the
password manager).

---

## 2. Database backup

Nightly `pg_dump`, encrypted before it ever touches disk, then shipped off-box.

The script is **`ops/invoice-backup.sh`** (in the repo, `shellcheck`-clean,
`chmod +x`). It is fully env-driven so the same file runs on the VPS cron and
locally for the dry-run / restore test — nothing to edit between environments:

```sh
# on the VPS (cron): the real recipient, the real dest, ship off-box
DATABASE_URL=…                       # app DB role, not superuser
AGE_BACKUP_RECIPIENT=age1…            # public key; private key never on the box
BACKUP_DEST=/var/backups/invoice-saas
UPLOADS_TAR_BASE=/srv/invoice-saas/apps/api   # tars $UPLOADS_TAR_PATH (default var/uploads)
BACKUP_REMOTE=r2:invoice-saas         # unset ⇒ rclone step is skipped
BACKUP_RETAIN_DAYS=7
PGDUMP=pg_dump                        # set to an absolute path where it's not on PATH
```

Internally it is the same pipe as before — no plaintext on disk:

```sh
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  | gzip -9 | age -r "$AGE_BACKUP_RECIPIENT" -o "$DEST/db-$STAMP.sql.gz.age"
tar -C "$UPLOADS_TAR_BASE" -czf - "$UPLOADS_TAR_PATH" \
  | age -r "$AGE_BACKUP_RECIPIENT" -o "$DEST/uploads-$STAMP.tar.gz.age"
rclone copy "$DEST" "$BACKUP_REMOTE/" --immutable      # only when BACKUP_REMOTE is set
find "$DEST" -type f -name '*.age' -mtime +"$BACKUP_RETAIN_DAYS" -delete
```

- **Encryption:** [`age`](https://github.com/FiloSottile/age) with an asymmetric
  recipient. The private key lives **only** in the password manager and on the
  restore operator's laptop — never on the VPS. A stolen backup file is inert.
  Generate the keypair once with `age-keygen -o age-backup-key.txt`; the
  `age1…` line it prints on stderr is `AGE_BACKUP_RECIPIENT`, the file is the
  identity kept off-box.
- **Schedule:** `cron` at 03:15 UTC (`15 3 * * *`) invoking
  `ops/invoice-backup.sh`. Log to `/var/log/invoice-backup.log`; alert on
  non-zero exit (§6).
- **Retention:** 7 daily local, 30 daily + 12 monthly on the remote (lifecycle
  rule on the bucket, or `rclone` with `--backup-dir`). The remote bucket is
  write-once / versioned so a compromised VPS can't delete history.
- **Off-box target:** an object store in a different region from the VPS
  (Cloudflare R2 / Backblaze B2 / Hetzner Storage Box). This is also where the
  eventual `Storage` cloud adapter (decision D15) would point.

## 3. Restore test

A backup that has never been restored is not a backup. Quarterly, and after any
schema migration that isn't purely additive. Use **`ops/invoice-restore.sh`**
(repo, `shellcheck`-clean) — it wraps the same pipe and runs migrations after:

```sh
AGE_IDENTITY_FILE=~/age-backup-key.txt \
TARGET_DATABASE_URL="$STAGING_DATABASE_URL" \
PGRESTORE=pg_restore \
ops/invoice-restore.sh /path/to/db-<stamp>.sql.gz.age
# it runs: age -d -i … | gunzip | pg_restore --clean --if-exists --no-owner -d …
#          then DATABASE_URL=<target> npm run db:migrate:deploy -w @invoice-saas/api
# smoke: log in, open the invoice list, download one PDF
```

Restore **into a scratch/staging DB only** — `pg_restore --clean` drops objects
it finds. The scratch DB must already exist (`createdb`).

Record the date and result at the bottom of this file.

---

## 4. Secrets management

Every secret the API needs is declared in one place — `apps/api/src/config/env.ts`
— and the process refuses to boot if one is missing or malformed. That list is the
authority; keep this table in step with it.

| Secret | Purpose | Rotation |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection (app DB user, **not** superuser) | On DB-user credential change |
| `JWT_ACCESS_SECRET` | Signs access tokens (≥32 chars, random) | See §5 — rotating it logs everyone out |
| `STRIPE_SECRET_KEY` | Stripe API (prefer a restricted `rk_` key) | Via Stripe dashboard; roll immediately on suspected leak |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures | When the webhook endpoint is recreated |
| `STRIPE_PRICE_*`, `STRIPE_PORTAL_CONFIG_ID` | Not secret, but env-pinned | On price/portal change |
| `RESEND_API_KEY` | Transactional email (verification, reset, invoice send — L1.1 / Decision A) | Resend dashboard; roll on suspected leak |
| `MAIL_FROM` | Not secret — the verified "from" address; required when `RESEND_API_KEY` is set | On sending-domain change (V1.5.3) |
| `ANTHROPIC_API_KEY` / `AI_API_KEY` (per `AI_PROVIDER`, L1.2 / D25) | AI drafting — unset by default (`NullDrafter`) | Provider dashboard |
| `SENTRY_DSN` (API) / `VITE_SENTRY_DSN` (web) | Error monitoring (X.5.5 / L3.3). Not secret — a DSN is a public ingest key. Unset ⇒ dark. Set at V1.6.1 | Sentry project settings; roll on suspected abuse |
| `SENTRY_RELEASE` (API) / `VITE_SENTRY_RELEASE` (web) | Not secret — release tag on every event (L3.3.1). Deploy step sets it to the shipped git SHA (V1.4.4) | Every deploy |

Rules:

- **`.env` is never committed.** `apps/api/.env.example` is the committed template
  (keys, no values). `.gitignore` already covers `.env`.
- On the VPS `.env` is `chmod 0600`, owned by the deploy user, outside the git
  working tree (e.g. `/etc/invoice-saas/api.env`, referenced by the systemd unit /
  PM2 config).
- The **source of truth** for secret values is the team password manager. The VPS
  copy is a deployment artefact, reconstructable from it.
- The Postgres role the app connects as owns only the `invoice_saas` database and
  has no `SUPERUSER` / `CREATEROLE`. Migrations may run as a separate,
  higher-privilege role invoked by the deploy step, not by the running app.
- Backup encryption key (`age`): password manager + restore operators' laptops
  only. Never on the VPS (a backup you can decrypt from the box you're backing up
  is not an off-site backup).
- No secret is ever logged. `request-logger.ts` logs method/path/status, never
  headers or bodies; `env.ts` is the only reader of `process.env`.

## 5. Rotating `JWT_ACCESS_SECRET`

Access tokens are short-lived (15 min) and refresh tokens are opaque DB rows, so a
hard rotation is tolerable:

1. Replace the value in the password manager and in the VPS env file.
2. Restart the API. Every existing access token now fails signature verification;
   the web client silently hits `/auth/refresh` (refresh tokens are unaffected —
   they're not signed) and gets a new one. Users stay logged in.
3. If the rotation is *because* of a suspected compromise, also run
   `revokeAllSessions` for affected users (or truncate `refresh_tokens`) so the
   refresh tokens die too.

---

## 6. Monitoring hooks (wire up with X.5.5)

- Backup script non-zero exit → alert (email / Slack / Sentry cron check).
- Age of newest remote backup object > 26 h → alert.
- Disk usage on `/var/backups` > 80 % → alert.

---

## Restore test log

| Date (UTC) | Backup stamp | Result | Operator |
| --- | --- | --- | --- |
| 2026-09-01 (**local**, L3.2.3) | `db-20260901T162853Z` | **Pass.** `ops/invoice-backup.sh` against local `invoice_saas` → age-encrypted `db-*.sql.gz.age` (29 KB) + `uploads-*.tar.gz.age` (10 KB), `rclone` step skipped. `ops/invoice-restore.sh` into a fresh `invoice_saas_restore_test`: `pg_restore` clean, `db:migrate:deploy` → "No pending migrations", all 30 users / 13 invoices / 17 clients / 12 templates / 16 migration rows present. App smoke off the restored DB: API boots, `/health` ok, login 200, `GET /invoices` 200, `POST /invoices/:id/pdf` → 200, valid 55 KB `%PDF-1.4`. Scratch DB dropped after. | local dev |
| _pending first VPS deploy_ (V1.5.2) | | | |
