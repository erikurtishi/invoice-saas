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
