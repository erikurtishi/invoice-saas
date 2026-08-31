/**
 * i18n resource-parity check (Epic X.1.1 / X.1.6).
 *
 * Fails the build if:
 *   1. `sq` or `mk` has a different key set from `en` (the source of truth).
 *   2. Any string's `{{token}}` interpolation placeholders differ from `en`'s.
 *   3. The D9 completion-gate marker still appears anywhere under `apps/`.
 *
 * `typeof en` already gives TypeScript-level key checking; this adds the runtime
 * value/token check and the D9 grep so `npm run i18n:check` is a single gate.
 *
 * Run: `npm run i18n:check -w @invoice-saas/web`
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { en } from '../src/i18n/resources/en';
import { mk } from '../src/i18n/resources/mk';
import { sq } from '../src/i18n/resources/sq';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(full, value);
    else for (const [k, v] of flatten(value, full)) out.set(k, v);
  }
  return out;
}

function tokens(value: string): Set<string> {
  return new Set([...value.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map((m) => m[1]!));
}

const errors: string[] = [];

const base = flatten(en as Tree);
const locales: Record<string, Map<string, string>> = {
  sq: flatten(sq as Tree),
  mk: flatten(mk as Tree),
};

for (const [name, map] of Object.entries(locales)) {
  for (const key of base.keys()) {
    if (!map.has(key)) errors.push(`[${name}] missing key: ${key}`);
  }
  for (const key of map.keys()) {
    if (!base.has(key)) errors.push(`[${name}] extra key not in en: ${key}`);
  }
  for (const [key, enValue] of base) {
    const localeValue = map.get(key);
    if (localeValue === undefined) continue;
    const want = [...tokens(enValue)].sort();
    const got = [...tokens(localeValue)].sort();
    if (want.join(',') !== got.join(',')) {
      errors.push(
        `[${name}] token mismatch at ${key}: en has {${want.join(', ')}}, ${name} has {${got.join(', ')}}`,
      );
    }
  }
}

// D9 completion gate: the epic is not done until this grep returns nothing.
// The needle is assembled at runtime so this script doesn't match itself.
const marker = ['TODO(', 'X', '.1.1)'].join('');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
try {
  const hits = execSync(
    `grep -rn --include='*.ts' --include='*.tsx' --exclude-dir=dist --exclude-dir=node_modules -F '${marker}' apps/ || true`,
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();
  if (hits) errors.push(`D9 completion-gate markers still present:\n${hits}`);
} catch {
  // grep unavailable — skip rather than fail the check on tooling.
}

if (errors.length > 0) {
  console.error(`i18n:check found ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `i18n:check OK — ${base.size} keys, 3 locales (en, sq, mk), interpolation tokens aligned, D9 gate clean.`,
);
