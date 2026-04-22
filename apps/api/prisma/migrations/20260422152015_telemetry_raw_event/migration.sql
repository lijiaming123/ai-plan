-- CreateTable
CREATE TABLE "TelemetryRawEvent" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "eventName" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousKey" TEXT,
    "sessionId" TEXT,
    "page" TEXT,
    "source" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "clientVersion" TEXT,
    "properties" JSONB,

    CONSTRAINT "TelemetryRawEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetryRawEvent_eventName_receivedAt_idx" ON "TelemetryRawEvent"("eventName", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "TelemetryRawEvent_userId_receivedAt_idx" ON "TelemetryRawEvent"("userId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "TelemetryRawEvent_anonymousKey_receivedAt_idx" ON "TelemetryRawEvent"("anonymousKey", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "TelemetryRawEvent_source_platform_clientVersion_receivedAt_idx" ON "TelemetryRawEvent"("source", "platform", "clientVersion", "receivedAt" DESC);
