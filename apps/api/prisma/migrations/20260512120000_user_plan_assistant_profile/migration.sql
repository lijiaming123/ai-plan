-- CreateTable
CREATE TABLE "UserPlanAssistantProfile" (
    "userId" TEXT NOT NULL,
    "tone" TEXT,
    "language" TEXT DEFAULT 'zh',
    "weeklyHoursCap" INTEGER,
    "preferMorning" BOOLEAN,
    "evidenceTolerance" TEXT,
    "defaultScenario" TEXT,
    "pinnedNotes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlanAssistantProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserPlanAssistantProfile" ADD CONSTRAINT "UserPlanAssistantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
