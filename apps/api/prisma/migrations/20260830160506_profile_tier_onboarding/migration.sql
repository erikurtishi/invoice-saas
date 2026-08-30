-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('FREE', 'BASIC', 'PREMIUM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "tier" "UserTier" NOT NULL DEFAULT 'FREE';

-- Backfill: accounts that existed before the onboarding wizard already have a
-- business name and have been using the app — don't force them back through it.
UPDATE "users" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP WHERE "onboardingCompletedAt" IS NULL;
