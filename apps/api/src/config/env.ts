import path from 'node:path';

import 'dotenv/config';
import { z } from 'zod';

/**
 * Server environment, validated once at boot.
 *
 * The API fails to start on invalid config rather than throwing its first
 * ReferenceError somewhere deep in a request handler at 2am. Nothing outside this
 * module reads `process.env` — import `env` instead, so every variable the app needs
 * is declared in exactly one place.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /** Origin allowed by CORS — the web app's URL. */
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  /**
   * Postgres connection string (decision D2). Required — the API has no useful
   * behaviour without a database, so a missing or malformed URL should stop the
   * process at boot rather than surface as a connection error on first request.
   *
   * This validates the shape only. Reachability is proven by the connection pool in
   * 0.2.2, which is the first code that actually opens a socket.
   */
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'must be a postgres:// or postgresql:// connection string',
    }),

  /**
   * Secret for signing access JWTs (backlog 1.1.1). Required, and must be long
   * enough to matter — a short shared secret is the usual way JWT auth is broken.
   * Refresh tokens are opaque random strings, not signed, so they need no key here.
   */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /** Access-token lifetime in seconds. Short by design — the refresh token is what
   * gives a long-lived session; a stolen access token stops working quickly. */
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  /** Refresh-token lifetime in days — the effective "stay logged in" window. */
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /**
   * Base URL of the web app, used to build the links in verification / reset
   * emails. Defaults to `WEB_ORIGIN`; split out so a future deploy can point emails
   * at a public URL that differs from the CORS origin.
   */
  APP_URL: z.string().url().optional(),

  /**
   * Directory the local-disk file store writes uploads into (backlog 1.2.3 —
   * business logos, later PDFs and other assets). Resolved relative to the API's
   * working directory. Served read-only at `/uploads`. When a cloud object store is
   * adopted this whole `Storage` impl is swapped in `lib/storage/index.ts` and this
   * var goes away.
   */
  UPLOAD_DIR: z.string().min(1).default('var/uploads'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

/** Where the web app lives, for links embedded in outbound email. */
export const appUrl = env.APP_URL ?? env.WEB_ORIGIN;

/** Absolute path to the upload directory (see `UPLOAD_DIR`). */
export const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

/** URL path prefix the upload directory is served under. Stored `logoUrl` values
 * are `${UPLOAD_URL_PATH}/logos/<file>` — root-relative, resolved against the API
 * origin by whoever renders them (web app, and the PDF pipeline in Phase 3). */
export const UPLOAD_URL_PATH = '/uploads';
