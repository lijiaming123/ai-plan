-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Plan_userId_deletedAt_idx" ON "Plan"("userId", "deletedAt");
