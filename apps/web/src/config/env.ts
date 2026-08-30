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
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
}

export const env = parsed.data;
