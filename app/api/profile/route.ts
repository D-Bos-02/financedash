import { prisma } from "@/lib/prisma";
import { ProfileInput, parseBody } from "@/lib/household-api";

// null until onboarding creates the profile.
export async function GET() {
  return Response.json(await prisma.profile.findUnique({ where: { id: "singleton" } }));
}

export async function PUT(request: Request) {
  const parsed = await parseBody(request, ProfileInput);
  if ("error" in parsed) return parsed.error;
  const { onboarded, ...fields } = parsed.data;
  const data = { ...fields, ...(onboarded !== undefined ? { onboardedAt: onboarded ? new Date() : null } : {}) };
  const profile = await prisma.profile.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  return Response.json(profile);
}
