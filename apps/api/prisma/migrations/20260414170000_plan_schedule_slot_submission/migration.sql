-- CreateTable
CREATE TABLE "PlanScheduleSlotSubmission" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanScheduleSlotSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanScheduleSlotAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanScheduleSlotAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanScheduleSlotSubmission_planId_slotKey_idx" ON "PlanScheduleSlotSubmission"("planId", "slotKey");

-- CreateIndex
CREATE INDEX "PlanScheduleSlotSubmission_userId_idx" ON "PlanScheduleSlotSubmission"("userId");

-- CreateIndex
CREATE INDEX "PlanScheduleSlotAttachment_submissionId_idx" ON "PlanScheduleSlotAttachment"("submissionId");

-- AddForeignKey
ALTER TABLE "PlanScheduleSlotSubmission" ADD CONSTRAINT "PlanScheduleSlotSubmission_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanScheduleSlotAttachment" ADD CONSTRAINT "PlanScheduleSlotAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PlanScheduleSlotSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
