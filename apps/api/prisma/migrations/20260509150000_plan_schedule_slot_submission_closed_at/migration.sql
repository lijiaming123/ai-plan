-- AlterTable
ALTER TABLE "PlanScheduleSlotSubmission" ADD COLUMN "closedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlanScheduleSlotSubmission_planId_userId_slotKey_closedAt_idx" ON "PlanScheduleSlotSubmission"("planId", "userId", "slotKey", "closedAt");

