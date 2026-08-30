/**
 * Issue a manual (cash) subscription grant from the command line (backlog 6.3.1 /
 * 6.3.2 — the interim path until the Epic 8 admin center has the form).
 *
 *   npm run grant -w @invoice-saas/api -- \
 *     --email tenant@example.com --tier BASIC --months 2 --note "€20 cash"
 *
 * Options:
 *   --email  <email>        tenant owner's email (required)
 *   --tier   BASIC|PREMIUM  (required)
 *   --months <n>            window length from --start (or use --end)
 *   --start  YYYY-MM-DD     default: today (UTC)
 *   --end    YYYY-MM-DD     explicit end date (overrides --months)
 *   --note   <text>         free-text context, e.g. amount received
 *   --by     <admin email>  records who issued it (optional)
 */
import { manualGrantCreateSchema } from '@invoice-saas/shared';
import { PrismaClient } from '@prisma/client';

import { createManualGrant } from '../src/services/manual-grant-service.js';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

const email = arg('email');
const tier = arg('tier');
const months = arg('months');
const start = arg('start') ?? todayIso();
const end = arg('end') ?? (months ? addMonthsIso(start, Number(months)) : undefined);
const note = arg('note');
const byEmail = arg('by');

if (!email || !tier || !end) {
  console.error(
    'Usage: npm run grant -w @invoice-saas/api -- --email <e> --tier BASIC|PREMIUM (--months <n> | --end YYYY-MM-DD) [--start YYYY-MM-DD] [--note <t>] [--by <admin email>]',
  );
  process.exit(1);
}

try {
  let grantedBy: string | null = null;
  if (byEmail) {
    const admin = await prisma.user.findUnique({
      where: { email: byEmail.toLowerCase() },
      select: { id: true },
    });
    if (!admin) {
      console.error(`--by: no account with email ${byEmail}`);
      process.exit(1);
    }
    grantedBy = admin.id;
  }

  const input = manualGrantCreateSchema.parse({
    email,
    tier,
    startDate: start,
    endDate: end,
    note,
  });
  const grant = await createManualGrant(grantedBy, input);
  console.log('granted:', JSON.stringify(grant, null, 2));
} finally {
  await prisma.$disconnect();
}
