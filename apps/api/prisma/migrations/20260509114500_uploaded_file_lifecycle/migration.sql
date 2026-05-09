-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "referencedAt" TIMESTAMP(3),
    "referencedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_storageName_key" ON "UploadedFile"("storageName");

-- CreateIndex
CREATE INDEX "UploadedFile_userId_createdAt_idx" ON "UploadedFile"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UploadedFile_referencedAt_createdAt_idx" ON "UploadedFile"("referencedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UploadedFile_deletedAt_idx" ON "UploadedFile"("deletedAt");

