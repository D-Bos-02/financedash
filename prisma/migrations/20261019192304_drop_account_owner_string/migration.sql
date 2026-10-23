/*
  Warnings:

  - You are about to drop the column `owner` on the `Account` table. All the data in the column will be lost.

*/
-- Turn each legacy owner key into a member (rename them in Settings) before the column goes. "joint" means shared.
INSERT INTO "Member" ("id", "name", "color")
SELECT DISTINCT 'legacy-' || "owner", "owner", '#8b5cf6' FROM "Account"
WHERE "owner" IS NOT NULL AND "owner" <> '' AND "owner" <> 'joint' AND "ownerId" IS NULL;
UPDATE "Account" SET "ownerId" = 'legacy-' || "owner"
WHERE "owner" IS NOT NULL AND "owner" <> '' AND "owner" <> 'joint' AND "ownerId" IS NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "institution" TEXT,
    "balance" REAL NOT NULL DEFAULT 0,
    "balanceMode" TEXT NOT NULL DEFAULT 'manual',
    "ownerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "plaidAccountId" TEXT,
    "plaidItemId" TEXT,
    CONSTRAINT "Account_plaidItemId_fkey" FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("balance", "balanceMode", "createdAt", "currency", "id", "institution", "isActive", "name", "ownerId", "plaidAccountId", "plaidItemId", "type", "updatedAt") SELECT "balance", "balanceMode", "createdAt", "currency", "id", "institution", "isActive", "name", "ownerId", "plaidAccountId", "plaidItemId", "type", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_plaidAccountId_key" ON "Account"("plaidAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
