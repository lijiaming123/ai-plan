-- CreateTable
CREATE TABLE "TelemetryDailyAgg" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "eventName" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelemetryDailyAgg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryDailyAgg_day_eventName_dimensionKey_key" ON "TelemetryDailyAgg"("day", "eventName", "dimensionKey");

-- CreateIndex
CREATE INDEX "TelemetryDailyAgg_day_eventName_idx" ON "TelemetryDailyAgg"("day", "eventName");
