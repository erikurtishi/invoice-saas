-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'PROFORMA', 'QUOTE', 'CREDIT_NOTE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "documentType" "DocumentType" NOT NULL DEFAULT 'INVOICE',
    "number" TEXT,
    "numberSeq" INTEGER,
    "numberYear" INTEGER,
    "language" "Language" NOT NULL DEFAULT 'EN',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paperSize" "PaperSize" NOT NULL DEFAULT 'A4',
    "clientId" TEXT,
    "templateId" TEXT,
    "businessName" TEXT,
    "businessAddress" TEXT,
    "businessEmail" TEXT,
    "businessPhone" TEXT,
    "businessTaxId" TEXT,
    "businessLogoUrl" TEXT,
    "clientName" TEXT,
    "clientAddress" TEXT,
    "clientEmail" TEXT,
    "clientTaxId" TEXT,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "paidDate" DATE,
    "paymentMethod" TEXT,
    "creditNoteRef" TEXT,
    "creditNoteOfId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "footerText" TEXT,
    "signatureLabel" TEXT,
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "taxTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "grandTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "amountDueMinor" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "unit" TEXT,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "discountBp" INTEGER NOT NULL DEFAULT 0,
    "lineSubtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "lineDiscountMinor" INTEGER NOT NULL DEFAULT 0,
    "lineTaxMinor" INTEGER NOT NULL DEFAULT 0,
    "lineTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_number_sequences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 0,
    "nextValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_numbering_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "format" TEXT NOT NULL,
    "seqPadding" INTEGER NOT NULL DEFAULT 4,
    "resetYearly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_numbering_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_tenantId_deletedAt_idx" ON "invoices"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "invoices_tenantId_documentType_deletedAt_idx" ON "invoices"("tenantId", "documentType", "deletedAt");

-- CreateIndex
CREATE INDEX "invoices_tenantId_clientId_idx" ON "invoices"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_issueDate_idx" ON "invoices"("tenantId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_documentType_numberYear_numberSeq_key" ON "invoices"("tenantId", "documentType", "numberYear", "numberSeq");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoiceId_position_idx" ON "invoice_line_items"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_number_sequences_tenantId_documentType_year_key" ON "invoice_number_sequences"("tenantId", "documentType", "year");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_numbering_settings_tenantId_documentType_key" ON "invoice_numbering_settings"("tenantId", "documentType");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_creditNoteOfId_fkey" FOREIGN KEY ("creditNoteOfId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_number_sequences" ADD CONSTRAINT "invoice_number_sequences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_numbering_settings" ADD CONSTRAINT "invoice_numbering_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
