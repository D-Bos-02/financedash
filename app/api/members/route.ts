import { prisma } from "@/lib/prisma";
import { MemberInput, parseBody } from "@/lib/household-api";

export async function GET() {
  return Response.json(await prisma.member.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }));
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, MemberInput.partial({ sortOrder: true }));
  if ("error" in parsed) return parsed.error;
  return Response.json(await prisma.member.create({ data: parsed.data }), { status: 201 });
}
