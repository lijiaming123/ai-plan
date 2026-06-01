-- AlterTable
ALTER TABLE "User" ADD COLUMN "planTier" TEXT NOT NULL DEFAULT 'basic';

-- CreateTable
CREATE TABLE "UserMonthlyAiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMonthlyAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMonthlyAiUsage_userId_idx" ON "UserMonthlyAiUsage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMonthlyAiUsage_userId_yearMonth_key" ON "UserMonthlyAiUsage"("userId", "yearMonth");

-- AddForeignKey
ALTER TABLE "UserMonthlyAiUsage" ADD CONSTRAINT "UserMonthlyAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
