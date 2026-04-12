-- CreateTable
CREATE TABLE "MarketTemplateFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTemplateFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketTemplateFavorite_userId_templateId_key" ON "MarketTemplateFavorite"("userId", "templateId");

-- CreateIndex
CREATE INDEX "MarketTemplateFavorite_templateId_idx" ON "MarketTemplateFavorite"("templateId");

-- AddForeignKey
ALTER TABLE "MarketTemplateFavorite" ADD CONSTRAINT "MarketTemplateFavorite_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
