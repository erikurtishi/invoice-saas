import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * After the run, remove the `e2e-…@example.test` tenants the specs created so the
 * local database doesn't accumulate them. Delegates to the API workspace, which
 * has the Prisma client.
 */
export default function globalTeardown(): void {
  const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
  try {
    execSync('npm run --silent e2e:cleanup -w @invoice-saas/api', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('e2e global teardown: cleanup failed (non-fatal)', err);
  }
}
