-- CreateTable
CREATE TABLE "SiteInstall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'script',
    "label" TEXT,
    "origin" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "publicInstallKey" TEXT NOT NULL,
    "managementTokenHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pluginVersion" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInstallLinkCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteInstallId" TEXT,
    "platform" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "returnUrl" TEXT,
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInstallLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInstallSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteInstallId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSeenAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInstallSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteInstall_publicInstallKey_key" ON "SiteInstall"("publicInstallKey");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInstall_tenantId_origin_platform_key" ON "SiteInstall"("tenantId", "origin", "platform");

-- CreateIndex
CREATE INDEX "SiteInstall_tenantId_status_platform_idx" ON "SiteInstall"("tenantId", "status", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInstallLinkCode_codeHash_key" ON "SiteInstallLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "SiteInstallLinkCode_tenantId_platform_expiresAt_idx" ON "SiteInstallLinkCode"("tenantId", "platform", "expiresAt");

-- CreateIndex
CREATE INDEX "SiteInstallLinkCode_siteInstallId_idx" ON "SiteInstallLinkCode"("siteInstallId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInstallSession_sessionId_key" ON "SiteInstallSession"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInstallSession_tokenHash_key" ON "SiteInstallSession"("tokenHash");

-- CreateIndex
CREATE INDEX "SiteInstallSession_tenantId_status_expiresAt_idx" ON "SiteInstallSession"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "SiteInstallSession_siteInstallId_status_idx" ON "SiteInstallSession"("siteInstallId", "status");

-- AddForeignKey
ALTER TABLE "SiteInstall" ADD CONSTRAINT "SiteInstall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstallLinkCode" ADD CONSTRAINT "SiteInstallLinkCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstallLinkCode" ADD CONSTRAINT "SiteInstallLinkCode_siteInstallId_fkey" FOREIGN KEY ("siteInstallId") REFERENCES "SiteInstall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstallSession" ADD CONSTRAINT "SiteInstallSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInstallSession" ADD CONSTRAINT "SiteInstallSession_siteInstallId_fkey" FOREIGN KEY ("siteInstallId") REFERENCES "SiteInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
