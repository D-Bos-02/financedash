-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CategoryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CategoryRule" ("category", "createdAt", "id", "pattern", "priority", "subCategory") SELECT "category", "createdAt", "id", "pattern", "priority", "subCategory" FROM "CategoryRule";
DROP TABLE "CategoryRule";
ALTER TABLE "new_CategoryRule" RENAME TO "CategoryRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
