import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PROVIDER_IDS, describeProvider, providerOptions, resolveChatProvider, transcriptFormat } from "@/lib/chat/provider";
import { loadSavedChoice } from "@/lib/chat/setup";
import { parseBody } from "@/lib/household-api";

// What the chat page's model picker shows: every provider and whether its key is in .env (never the key),
// the saved choice, and what chat is actually using.
async function state() {
  const saved = await loadSavedChoice();
  const setup = resolveChatProvider(process.env, saved);
  return {
    providers: providerOptions(process.env),
    saved,
    current: setup.ok ? { name: describeProvider(setup.provider), source: setup.source, format: transcriptFormat(setup.provider) } : null,
    reason: setup.ok ? null : setup.reason,
  };
}

export async function GET() {
  return Response.json(await state());
}

const Choice = z.object({
  provider: z.enum(PROVIDER_IDS as [string, ...string[]]).nullable(), // null: decide from .env
  model: z.string().trim().max(200).nullable(),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, Choice);
  if ("error" in parsed) return parsed.error;
  const { provider, model } = parsed.data;
  const data = { aiProvider: provider, aiModel: provider ? model || null : null };
  await prisma.settings.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  return Response.json(await state());
}
