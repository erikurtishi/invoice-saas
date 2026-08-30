import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Location of the self-hosted invoice fonts (backlog 3.1.6). They live in
 * `@invoice-saas/shared` (`packages/shared/assets/fonts/`) so the renderer package
 * and its font files stay together; the API is what actually serves them over
 * HTTP, at `FONTS_URL_PATH`.
 *
 * Resolved through Node's module resolution rather than a relative `../../..`
 * walk, so it is correct whether we run from `src/` (tsx) or `dist/` (built).
 */
const require = createRequire(import.meta.url);
const sharedRoot = dirname(require.resolve('@invoice-saas/shared/package.json'));

export const FONTS_DIR = join(sharedRoot, 'assets', 'fonts');

/** URL prefix the fonts are served under; the renderer's `assetBaseUrl` + this is
 * what the `@font-face` `src` points at. */
export const FONTS_URL_PATH = '/fonts';
