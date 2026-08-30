/**
 * Self-contained fuzzy name matching for AI client reconciliation (backlog
 * 7.1.4). No dependency — a small Levenshtein plus normalisation is enough to
 * decide "the prompt's 'Acme' is the saved 'Acme Trading LLC'" vs "this looks
 * like a new client".
 *
 * Used only here and in `ai-draft-service.ts`. The threshold that turns a ratio
 * into a match lives in `@invoice-saas/shared` (`AI_CLIENT_MATCH_THRESHOLD`).
 */

/** Company-form words dropped before comparing, so "Acme LLC" ≈ "Acme". Covers
 *  the target markets (MK/AL/XK) and common English forms. */
const LEGAL_SUFFIXES = new Set([
  'llc',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'co',
  'company',
  'corp',
  'corporation',
  'gmbh',
  'sa',
  'sas',
  'sarl',
  'bv',
  'srl',
  'spa',
  'plc',
  // Balkans
  'doo',
  'dooel', // MK
  'ad',
  'shpk',
  'sha', // AL (sh.p.k / sh.a)
  'kb',
]);

/** Combining diacritical marks (U+0300–U+036F), removed after an NFKD split so
 *  "Béta" collapses to "beta". */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lower-case, strip accents and punctuation, collapse whitespace, drop trailing
 *  legal-form tokens. `"Sh.P.K  Béta-Group"` → `"beta group"`. */
export function normaliseCompanyName(raw: string): string {
  const base = raw
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (base === '') return '';
  const tokens = base.split(' ').filter((t) => !LEGAL_SUFFIXES.has(t));
  return (tokens.length > 0 ? tokens : base.split(' ')).join(' ');
}

/** Classic iterative Levenshtein distance (two-row). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/**
 * Similarity of two names, 0–1, after normalisation. 1 = identical normalised
 * forms; a subset match ("acme" vs "acme trading") is scored high so a terse
 * prompt still matches a fuller saved name.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseCompanyName(a);
  const nb = normaliseCompanyName(b);
  if (na === '' || nb === '') return 0;
  if (na === nb) return 1;

  // One name fully contained in the other (token-aligned) — very likely the same
  // party stated at different lengths.
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if ((' ' + long + ' ').includes(' ' + short + ' ')) return 0.95;

  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

export interface NameMatch {
  index: number;
  score: number;
}

/** Best match for `query` among `candidates` (by original, un-normalised
 *  string). Returns `null` for an empty query or no candidates. */
export function bestNameMatch(query: string, candidates: string[]): NameMatch | null {
  if (query.trim() === '' || candidates.length === 0) return null;
  let best: NameMatch = { index: -1, score: 0 };
  candidates.forEach((candidate, index) => {
    const score = nameSimilarity(query, candidate);
    if (score > best.score) best = { index, score };
  });
  return best.index === -1 ? null : best;
}
