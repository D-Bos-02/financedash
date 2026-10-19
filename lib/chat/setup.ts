// Server-only: the chat provider in use, from the choice saved in Settings and the keys in .env.

import { prisma } from "@/lib/prisma";
import { resolveChatProvider, type ProviderSetup, type SavedChoice } from "@/lib/chat/provider";

export async function loadSavedChoice(): Promise<SavedChoice> {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { aiProvider: true, aiModel: true } });
  return { provider: s?.aiProvider ?? null, model: s?.aiModel ?? null };
}

export async function loadChatSetup(): Promise<ProviderSetup> {
  return resolveChatProvider(process.env, await loadSavedChoice());
}
