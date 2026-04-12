-- CreateTable
CREATE TABLE "PresetTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "payload" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketTemplate" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sourcePlanId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "publishedAt" TIMESTAMP(3),
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "applicationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketTemplateLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTemplateLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PresetTemplate_slug_key" ON "PresetTemplate"("slug");

-- CreateIndex
CREATE INDEX "PresetTemplate_isActive_sortOrder_idx" ON "PresetTemplate"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "PresetTemplate_category_idx" ON "PresetTemplate"("category");

-- CreateIndex
CREATE INDEX "MarketTemplate_status_publishedAt_idx" ON "MarketTemplate"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "MarketTemplate_category_idx" ON "MarketTemplate"("category");

-- CreateIndex
CREATE INDEX "MarketTemplate_authorId_idx" ON "MarketTemplate"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketTemplateLike_userId_templateId_key" ON "MarketTemplateLike"("userId", "templateId");

-- CreateIndex
CREATE INDEX "MarketTemplateLike_templateId_idx" ON "MarketTemplateLike"("templateId");

-- AddForeignKey
ALTER TABLE "MarketTemplateLike" ADD CONSTRAINT "MarketTemplateLike_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
