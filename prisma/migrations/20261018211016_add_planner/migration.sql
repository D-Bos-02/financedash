-- AlterTable
ALTER TABLE "Account" ADD COLUMN "owner" TEXT;

-- CreateTable
CREATE TABLE "PlannerState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);
