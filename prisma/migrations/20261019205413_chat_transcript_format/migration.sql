-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "messages" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'anthropic',
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ChatConversation" ("costUsd", "createdAt", "id", "messages", "title", "updatedAt") SELECT "costUsd", "createdAt", "id", "messages", "title", "updatedAt" FROM "ChatConversation";
DROP TABLE "ChatConversation";
ALTER TABLE "new_ChatConversation" RENAME TO "ChatConversation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
