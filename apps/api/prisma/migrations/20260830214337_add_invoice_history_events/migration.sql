-- CreateEnum
CREATE TYPE "InvoiceEventType" AS ENUM ('CREATED', 'EDITED', 'DOWNLOADED', 'SENT', 'DUPLICATED_FROM', 'DUPLICATED_INTO');

-- CreateTable
CREATE TABLE "invoice_history_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "eventType" "InvoiceEventType" NOT NULL,
    "userId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_history_events_invoiceId_timestamp_idx" ON "invoice_history_events"("invoiceId", "timestamp");

-- CreateIndex
CREATE INDEX "invoice_history_events_tenantId_timestamp_idx" ON "invoice_history_events"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "invoice_history_events_tenantId_eventType_idx" ON "invoice_history_events"("tenantId", "eventType");

-- AddForeignKey
ALTER TABLE "invoice_history_events" ADD CONSTRAINT "invoice_history_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_history_events" ADD CONSTRAINT "invoice_history_events_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
