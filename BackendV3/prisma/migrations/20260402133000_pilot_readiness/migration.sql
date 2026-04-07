-- AlterTable
ALTER TABLE "Lead"
ADD COLUMN "companyDomain" TEXT,
ADD COLUMN "authorityConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "icpFit" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "qualificationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "bookingEligible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DemoBooking"
ADD COLUMN "salesDisposition" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "salesDispositionReason" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CrmSyncEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "leadId" TEXT,
    "toolExecutionId" TEXT,
    "webhookUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_bookingEligible_idx" ON "Lead"("bookingEligible");

-- CreateIndex
CREATE INDEX "DemoBooking_tenantId_salesDisposition_idx" ON "DemoBooking"("tenantId", "salesDisposition");

-- CreateIndex
CREATE INDEX "CrmSyncEvent_tenantId_status_createdAt_idx" ON "CrmSyncEvent"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmSyncEvent_conversationId_idx" ON "CrmSyncEvent"("conversationId");

-- CreateIndex
CREATE INDEX "CrmSyncEvent_leadId_idx" ON "CrmSyncEvent"("leadId");

-- AddForeignKey
ALTER TABLE "CrmSyncEvent" ADD CONSTRAINT "CrmSyncEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSyncEvent" ADD CONSTRAINT "CrmSyncEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSyncEvent" ADD CONSTRAINT "CrmSyncEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSyncEvent" ADD CONSTRAINT "CrmSyncEvent_toolExecutionId_fkey" FOREIGN KEY ("toolExecutionId") REFERENCES "ToolExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
