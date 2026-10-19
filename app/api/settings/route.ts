import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBaseCurrency } from "@/lib/profile";

// The Settings page edits theme (Settings) and base currency (Profile) together.
export async function GET() {
  const [settings, baseCurrency] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    getBaseCurrency(),
  ]);
  return Response.json({ id: "singleton", theme: settings?.theme ?? "dark", baseCurrency });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const [settings, profile] = await Promise.all([
    prisma.settings.upsert({
      where: { id: "singleton" },
      update: { theme: body.theme },
      create: { id: "singleton", theme: body.theme ?? "dark" },
    }),
    prisma.profile.upsert({
      where: { id: "singleton" },
      update: { baseCurrency: body.baseCurrency },
      create: { id: "singleton", baseCurrency: body.baseCurrency ?? "USD" },
    }),
  ]);
  return Response.json({ id: "singleton", theme: settings.theme, baseCurrency: profile.baseCurrency });
}
