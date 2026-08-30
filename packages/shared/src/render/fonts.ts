/**
 * Font handling for the renderer (backlog 3.1.6, spec §10).
 *
 * Only self-hosted Noto Sans + Noto Serif are used — both carry full Latin
 * Extended + Cyrillic, so a Macedonian invoice can never silently fall back to a
 * font without Cyrillic. The woff2 files live at `packages/shared/assets/fonts/`
 * and are served by the API at `<assetBaseUrl>/fonts/*.woff2`.
 *
 * `system-ui` is BANNED here (decision D10): on macOS Chrome emits a ToUnicode map
 * that turns Cyrillic к (U+043A) into Latin ĸ (U+0138) — the PDF looks right but
 * the text copies/extracts wrong. Every stack below is explicit and Noto-first.
 */

/** woff2 files under `packages/shared/assets/fonts/`, served at `/fonts/<file>`. */
export const FONT_FILES = [
  'noto-sans-400.woff2',
  'noto-sans-700.woff2',
  'noto-serif-400.woff2',
  'noto-serif-700.woff2',
] as const;

/** Curated font pairings (backlog 3.2.6 — "curated pairs only, all Cyrillic-safe").
 * Every option resolves to Noto, so Cyrillic coverage is guaranteed by construction. */
export const FONT_PAIRINGS = ['noto-sans', 'noto-serif-headings', 'noto-serif'] as const;
export type FontPairing = (typeof FONT_PAIRINGS)[number];

export const FONT_PAIRING_LABELS: Record<FontPairing, string> = {
  'noto-sans': 'Noto Sans',
  'noto-serif-headings': 'Noto Serif headings · Noto Sans body',
  'noto-serif': 'Noto Serif',
};

// Explicit fallback stacks — never `system-ui` (D10). Ordered: our font, then a
// widely-installed same-genre face, then the generic family.
const SANS = "'Noto Sans', Helvetica, Arial, sans-serif";
const SERIF = "'Noto Serif', Georgia, 'Times New Roman', serif";

export interface FontStack {
  /** Body copy. */
  body: string;
  /** Headings / the invoice title / block headers. */
  heading: string;
}

export function fontStackFor(pairing: FontPairing): FontStack {
  switch (pairing) {
    case 'noto-serif':
      return { body: SERIF, heading: SERIF };
    case 'noto-serif-headings':
      return { body: SANS, heading: SERIF };
    case 'noto-sans':
    default:
      return { body: SANS, heading: SANS };
  }
}

/**
 * `@font-face` rules pointing at the self-hosted woff2. `assetBaseUrl` is the
 * origin serving `/fonts` (the API in every current caller); `''` yields
 * root-relative URLs. For a fully hermetic PDF a later caller can pass pre-built
 * data-URI rules instead — see 4.3.1.
 */
export function fontFaceCss(assetBaseUrl = ''): string {
  const base = assetBaseUrl.replace(/\/$/, '');
  const face = (family: string, weight: number, file: string) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
    `font-display:swap;src:url("${base}/fonts/${file}") format("woff2");}`;
  return [
    face('Noto Sans', 400, 'noto-sans-400.woff2'),
    face('Noto Sans', 700, 'noto-sans-700.woff2'),
    face('Noto Serif', 400, 'noto-serif-400.woff2'),
    face('Noto Serif', 700, 'noto-serif-700.woff2'),
  ].join('\n');
}
