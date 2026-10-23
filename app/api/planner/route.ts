import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeInputs } from "@/lib/planner";

export async function GET() {
  const state = await prisma.plannerState.findUnique({ where: { id: "singleton" } });
  return Response.json(sanitizeInputs(state ? JSON.parse(state.data) : {}));
}

export async function PUT(request: NextRequest) {
  const inputs = sanitizeInputs(await request.json());
  const data = JSON.stringify(inputs);
  await prisma.plannerState.upsert({
    where: { id: "singleton" },
    update: { data },
    create: { id: "singleton", data },
  });
  return Response.json(inputs);
}
