import { randomBytes } from 'node:crypto';

import type { User } from '@prisma/client';
import {
  type AuthUser,
  type BusinessProfileInput,
  type BusinessProfileResponse,
  LOGO_ACCEPTED_MIME,
  LOGO_MAX_BYTES,
  LOGO_MAX_DIMENSION,
} from '@invoice-saas/shared';
import sharp from 'sharp';

import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';
import { storage } from '../lib/storage/index.js';
import { toAuthUser } from './auth-service.js';

/**
 * Business-profile reads and writes (backlog Epic 1.2). Like `auth-service`, these
 * operate on the `users` row itself — the user *is* the tenant (decision D3) — so
 * they use the raw `prisma` client with an explicit `where: { id: userId }`, not
 * the tenant-scoped `req.db` (which scopes *child* models by `tenantId` and would
 * have nothing to do here).
 */

function toProfileResponse(user: User): BusinessProfileResponse {
  return {
    businessName: user.businessName,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    city: user.city,
    postalCode: user.postalCode,
    country: user.country,
    taxId: user.taxId,
    defaultCurrency: user.defaultCurrency,
    defaultPaymentTermsDays: user.defaultPaymentTermsDays,
    defaultPaperSize: user.defaultPaperSize,
    preferredLanguage: user.preferredLanguage,
    logoUrl: user.logoUrl,
  };
}

async function loadUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized();
  return user;
}

export async function getProfile(userId: string): Promise<BusinessProfileResponse> {
  return toProfileResponse(await loadUser(userId));
}

export async function updateProfile(
  userId: string,
  input: BusinessProfileInput,
): Promise<BusinessProfileResponse> {
  // The form submits the whole object; a cleared optional field arrives as
  // `null`/`undefined` and is written as an explicit `null` (no partial updates —
  // see the schema comment).
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      businessName: input.businessName,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      country: input.country ?? null,
      taxId: input.taxId ?? null,
      defaultCurrency: input.defaultCurrency,
      defaultPaymentTermsDays: input.defaultPaymentTermsDays,
      defaultPaperSize: input.defaultPaperSize,
      preferredLanguage: input.preferredLanguage,
    },
  });
  return toProfileResponse(user);
}

// --- Logo (backlog 1.2.3) -------------------------------------------------------

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Validate, normalise and store an uploaded logo. The file is re-encoded to a
 * bounded WebP regardless of what came in — this strips EXIF/metadata, caps the
 * dimensions, and means the rest of the app only ever deals with one format. The
 * stored key carries a random token so replacing a logo yields a new URL (old
 * cached copies can't linger).
 */
export async function setLogo(
  userId: string,
  file: UploadedFile,
): Promise<BusinessProfileResponse> {
  // Defence in depth — multer already enforces both, but the service must not
  // trust that it ran with the right config.
  if (!LOGO_ACCEPTED_MIME.includes(file.mimetype as (typeof LOGO_ACCEPTED_MIME)[number])) {
    throw ApiError.validation('Upload a PNG, JPEG or WebP image.', {
      logo: ['Upload a PNG, JPEG or WebP image.'],
    });
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw ApiError.validation('That image is larger than 2 MB.', {
      logo: ['That image is larger than 2 MB.'],
    });
  }

  let body: Buffer;
  try {
    body = await sharp(file.buffer)
      .rotate() // bake in EXIF orientation before it's stripped
      .resize(LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw ApiError.validation("That image couldn't be processed. Try a different file.", {
      logo: ["That image couldn't be processed. Try a different file."],
    });
  }

  const user = await loadUser(userId);
  const key = `logos/${userId}-${randomBytes(8).toString('hex')}.webp`;
  const { url } = await storage.put({ key, body, contentType: 'image/webp' });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { logoUrl: url },
  });

  // Best-effort cleanup of the previous file — a leaked object is harmless, a
  // failed request because cleanup threw is not.
  if (user.logoUrl && user.logoUrl !== url) {
    const oldKey = storage.keyFromUrl(user.logoUrl);
    if (oldKey) await storage.delete(oldKey).catch(() => undefined);
  }

  return toProfileResponse(updated);
}

export async function removeLogo(userId: string): Promise<BusinessProfileResponse> {
  const user = await loadUser(userId);
  if (user.logoUrl) {
    const key = storage.keyFromUrl(user.logoUrl);
    if (key) await storage.delete(key).catch(() => undefined);
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { logoUrl: null },
  });
  return toProfileResponse(updated);
}

// --- Onboarding (backlog 1.2.4) ----------------------------------------------

/** Mark the onboarding wizard finished (or skipped). Idempotent — the first call
 * stamps `onboardingCompletedAt`, later calls are no-ops. Returns the refreshed
 * public user so the web app can update its session cache without a round-trip. */
export async function completeOnboarding(userId: string): Promise<AuthUser> {
  const user = await loadUser(userId);
  if (user.onboardingCompletedAt !== null) return toAuthUser(user);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompletedAt: new Date() },
  });
  return toAuthUser(updated);
}
