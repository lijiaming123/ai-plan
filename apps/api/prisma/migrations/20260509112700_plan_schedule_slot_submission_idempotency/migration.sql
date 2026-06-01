-- AlterTable
ALTER TABLE "PlanScheduleSlotSubmission" ADD COLUMN     "idempotencyKeyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PlanScheduleSlotSubmission_planId_userId_slotKey_idempotenc_key" ON "PlanScheduleSlotSubmission"("planId", "userId", "slotKey", "idempotencyKeyHash");

