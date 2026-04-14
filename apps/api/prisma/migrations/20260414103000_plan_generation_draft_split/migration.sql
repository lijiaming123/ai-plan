-- PlanGenerationDraft：生成流程专用；已定稿数据仅保留在 Plan
CREATE TABLE "PlanGenerationDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "requirement" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanGenerationDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanGenerationDraft_userId_idx" ON "PlanGenerationDraft"("userId");

CREATE TABLE "PlanGenerationDraftVersion" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "requirement" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "schedule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanGenerationDraftVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanGenerationDraftVersion_draftId_version_key" ON "PlanGenerationDraftVersion"("draftId", "version");
CREATE INDEX "PlanGenerationDraftVersion_draftId_idx" ON "PlanGenerationDraftVersion"("draftId");

ALTER TABLE "PlanGenerationDraftVersion" ADD CONSTRAINT "PlanGenerationDraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PlanGenerationDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlanGenerationDraftStage" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanGenerationDraftStage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanGenerationDraftStage_draftId_idx" ON "PlanGenerationDraftStage"("draftId");

ALTER TABLE "PlanGenerationDraftStage" ADD CONSTRAINT "PlanGenerationDraftStage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PlanGenerationDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PlanGenerationDraft" ("id","userId","goal","deadline","requirement","type","currentVersion","createdAt")
SELECT "id","userId","goal","deadline","requirement","type","currentVersion","createdAt"
FROM "Plan"
WHERE "status" = 'draft';

INSERT INTO "PlanGenerationDraftVersion" ("id","draftId","version","requirement","deadline","snapshot","schedule","createdAt")
SELECT "id","planId","version","requirement","deadline","snapshot","schedule","createdAt"
FROM "PlanVersion"
WHERE "planId" IN (SELECT "id" FROM "Plan" WHERE "status" = 'draft');

INSERT INTO "PlanGenerationDraftStage" ("id","draftId","name","sortOrder","createdAt")
SELECT "id","planId","name","sortOrder","createdAt"
FROM "PlanStage"
WHERE "planId" IN (SELECT "id" FROM "Plan" WHERE "status" = 'draft');

DELETE FROM "PlanVersion" WHERE "planId" IN (SELECT "id" FROM "Plan" WHERE "status" = 'draft');
DELETE FROM "PlanStage" WHERE "planId" IN (SELECT "id" FROM "Plan" WHERE "status" = 'draft');
DELETE FROM "Plan" WHERE "status" = 'draft';

ALTER TABLE "Plan" DROP COLUMN "status";
