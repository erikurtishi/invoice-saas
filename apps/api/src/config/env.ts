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
/** An optional env var where a blank / whitespace-only value (a placeholder line
 *  in `.env`) is treated as "unset" rather than failing the inner check. */
function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional(),
  );
}

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

  /**
   * Stripe billing (backlog Epic 6.2). All optional: with no `STRIPE_SECRET_KEY`
   * the app boots with a `NullBilling` adapter and the `/billing/checkout` /
   * `/portal` endpoints return 503 — same "degrade, don't crash" shape as the
   * `Mailer` (D13) and `Storage` (D15) ports. Restricted test/live keys (`rk_…`)
   * are preferred over secret keys (`sk_…`).
   */
  STRIPE_SECRET_KEY: optionalEnv(
    z
      .string()
      .refine((v) => v.startsWith('rk_') || v.startsWith('sk_'), 'must be an rk_ or sk_ key'),
  ),
  /** From `stripe listen --print-secret` locally, or the Dashboard webhook endpoint. */
  STRIPE_WEBHOOK_SECRET: optionalEnv(z.string().startsWith('whsec_')),
  /** Optional exact Price IDs. Blank → resolved at runtime by `lookup_key`
   * (`basic_monthly` / `premium_monthly`), which `npm run stripe:setup` creates. */
  STRIPE_PRICE_BASIC: optionalEnv(z.string().startsWith('price_')),
  STRIPE_PRICE_PREMIUM: optionalEnv(z.string().startsWith('price_')),
  /** Customer Portal configuration id (`bpc_…`), printed by `npm run stripe:setup`. */
  STRIPE_PORTAL_CONFIG_ID: optionalEnv(z.string().startsWith('bpc_')),

  /**
   * Sentry error monitoring (backlog X.5.5). Optional — with no DSN the SDK is
   * never initialised and `captureException` is a no-op, same "degrade, don't
   * crash" shape as the Stripe / Mailer / Storage ports. Set it in production
   * (and staging) to a project DSN from a free Sentry account.
   */
  SENTRY_DSN: optionalEnv(z.string().url()),
  /** Fraction of transactions to trace, 0–1. Errors are always sent; this only
   *  gates performance sampling. Default 0 (errors only). */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  /**
   * Release identifier for Sentry (backlog L3.3.1). Optional; when set it tags
   * every event so an incident can be tied to a specific deploy. The deploy step
   * (V1.4.4) sets this to the git SHA it shipped; unset locally, where events are
   * grouped by `environment` alone.
   */
  SENTRY_RELEASE: optionalEnv(z.string().min(1)),

  /**
   * Transactional email (backlog 4.3.4 / L1.1, Decision A — Resend). Optional:
   * with no `RESEND_API_KEY` the app runs the `ConsoleMailer` (prints the
   * verification / reset link to the server console) — same "degrade, don't
   * crash" shape as the Stripe / AI ports, except `mail/index.ts` turns a missing
   * mailer into a boot error when `NODE_ENV=production` (V1). When the key is
   * present `MAIL_FROM` is required — the verified "from" address, e.g.
   * `onboarding@resend.dev` on the provider sandbox, or `billing@yourdomain` once
   * the domain is authed (V1.5.3).
   */
  RESEND_API_KEY: optionalEnv(z.string().startsWith('re_')),
  MAIL_FROM: optionalEnv(z.string().min(3)),

  /**
   * AI invoice drafting (backlog Epic 7.1 / L1.2). Optional and off by default:
   * with `AI_PROVIDER` unset the app runs the `NullDrafter`, `/ai/*` returns 503
   * and the web hides the panel — same "degrade, don't crash" shape as the
   * Stripe / Mailer ports. No model is contacted until a provider is named here.
   *
   *   AI_PROVIDER=anthropic  needs ANTHROPIC_API_KEY + AI_MODEL
   *     (an existing hosted model, e.g. AI_MODEL=claude-haiku-4-5)
   *   AI_PROVIDER=custom     needs AI_BASE_URL + AI_MODEL (+ optional AI_API_KEY)
   *     (your own OpenAI-compatible /chat/completions endpoint)
   */
  AI_PROVIDER: optionalEnv(z.enum(['anthropic', 'custom'])),
  /** Exact model id passed to the provider and recorded in `AiGenerationLog`. */
  AI_MODEL: optionalEnv(z.string().min(1)),
  /** `AI_PROVIDER=anthropic`. */
  ANTHROPIC_API_KEY: optionalEnv(z.string().min(1)),
  /** `AI_PROVIDER=custom` — base URL incl. any version segment, e.g.
   *  `http://localhost:11434/v1`. */
  AI_BASE_URL: optionalEnv(z.string().url()),
  /** `AI_PROVIDER=custom` — bearer token; omit for an unauthenticated local server. */
  AI_API_KEY: optionalEnv(z.string().min(1)),
});

const parsed = envSchema
  .superRefine((value, ctx) => {
    if (value.RESEND_API_KEY && !value.MAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_FROM'],
        message: 'required when RESEND_API_KEY is set (the verified "from" address)',
      });
    }

    const require = (key: keyof typeof value, why: string) => {
      if (!value[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: why });
      }
    };
    if (value.AI_PROVIDER === 'anthropic') {
      require('ANTHROPIC_API_KEY', 'required when AI_PROVIDER=anthropic');
      require('AI_MODEL', 'required when AI_PROVIDER is set (the model id)');
    }
    if (value.AI_PROVIDER === 'custom') {
      require('AI_BASE_URL', 'required when AI_PROVIDER=custom (the /v1 base URL)');
      require('AI_MODEL', 'required when AI_PROVIDER is set (the model id)');
    }
  })
  .safeParse(process.env);

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
