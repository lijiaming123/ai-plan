-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Plan_userId_archivedAt_idx" ON "Plan"("userId", "archivedAt");
