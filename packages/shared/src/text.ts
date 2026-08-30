import { z } from 'zod';

/**
 * Shared field builders reused across the domain payload schemas (profile, client,
 * later product/template). Kept in one place so "an optional free-text field" means
 * exactly the same thing — trimmed, length-capped, and `''` normalised to `null` so
 * a cleared input round-trips as an explicit null rather than an empty string —
 * everywhere it is used.
 */

/**
 * An optional free-text field: trimmed, capped at `max` characters, and normalised
 * so `''` (a cleared input) becomes `null`. The result is `string | null`, always
 * `.optional()` so an omitted key is also accepted.
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
