/**
 * Flip a user's role (backlog 8.1.1 — the admin role exists on the model; this is
 * how you grant it until the Epic 8 admin center can). Needed to exercise the
 * Epic 6.3 manual-grant API.
 *
 *   npm run set-admin -w @invoice-saas/api -- --email you@example.com [--role ADMIN|OWNER]
 */
import { PrismaClient, type UserRole } from '@prisma/client';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.toLowerCase();
const role = (arg('role') ?? 'ADMIN').toUpperCase();

if (!email || (role !== 'ADMIN' && role !== 'OWNER')) {
  console.error(
    'Usage: npm run set-admin -w @invoice-saas/api -- --email <e> [--role ADMIN|OWNER]',
  );
  process.exit(1);
}

try {
  const user = await prisma.user.update({
    where: { email },
    data: { role: role as UserRole },
    select: { email: true, role: true },
  });
  console.log(`${user.email} → ${user.role}`);
} finally {
  await prisma.$disconnect();
}
