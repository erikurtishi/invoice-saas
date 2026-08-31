-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "targetTenantEmail" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actorUserId_createdAt_idx" ON "admin_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetTenantId_createdAt_idx" ON "admin_audit_logs"("targetTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_createdAt_idx" ON "admin_audit_logs"("action", "createdAt");
