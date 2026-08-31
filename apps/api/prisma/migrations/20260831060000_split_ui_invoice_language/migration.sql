-- Epic X.1.4 — split the single language preference into an app-UI language and a
-- printed-invoice language. Existing tenants keep one consistent language: the old
-- value becomes `invoiceLanguage` and `uiLanguage` is backfilled to match.

ALTER TABLE "users" RENAME COLUMN "preferredLanguage" TO "invoiceLanguage";

ALTER TABLE "users" ADD COLUMN "uiLanguage" "Language" NOT NULL DEFAULT 'EN';

UPDATE "users" SET "uiLanguage" = "invoiceLanguage";
