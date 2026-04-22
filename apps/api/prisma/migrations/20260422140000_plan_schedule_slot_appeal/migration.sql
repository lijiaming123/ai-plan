-- CreateTable
CREATE TABLE "PlanScheduleSlotAppeal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanScheduleSlotAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanScheduleSlotAppeal_planId_userId_idx" ON "PlanScheduleSlotAppeal"("planId", "userId");

-- CreateIndex
CREATE INDEX "PlanScheduleSlotAppeal_planId_slotKey_status_idx" ON "PlanScheduleSlotAppeal"("planId", "slotKey", "status");

-- AddForeignKey
ALTER TABLE "PlanScheduleSlotAppeal" ADD CONSTRAINT "PlanScheduleSlotAppeal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
