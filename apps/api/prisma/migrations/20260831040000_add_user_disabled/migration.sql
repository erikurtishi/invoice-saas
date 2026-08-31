-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "disabledReason" TEXT;
