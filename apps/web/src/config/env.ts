import { z } from 'zod';

/**
 * Client environment, validated once at module load.
 *
 * Only `VITE_`-prefixed variables reach the browser bundle — anything else Vite
 * strips, which is the guardrail that keeps a server secret from being shipped to a
 * client. Never put a secret here: everything in this file is public by definition.
 */
const envSchema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:4000'),
  /** Sentry browser DSN (backlog X.5.5). Optional — with no value the SDK is
   *  never loaded and error reporting is a no-op. A DSN is not a secret. */
  VITE_SENTRY_DSN: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional(),
  ),
  /** Release identifier for Sentry (backlog L3.3.1). Optional; when set it tags
   *  every browser event so an incident maps to a specific deploy. The build step
   *  (V1.4.4) injects the shipped git SHA; unset in local dev. Not a secret. */
  VITE_SENTRY_RELEASE: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(1).optional(),
  ),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
}

export const env = parsed.data;
