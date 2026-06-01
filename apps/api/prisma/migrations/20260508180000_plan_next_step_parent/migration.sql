-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "nextStep" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "parentPlanId" TEXT;

-- CreateIndex
CREATE INDEX "Plan_parentPlanId_idx" ON "Plan"("parentPlanId");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_parentPlanId_fkey" FOREIGN KEY ("parentPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PlanGenerationDraft" ADD COLUMN "parentPlanId" TEXT;
