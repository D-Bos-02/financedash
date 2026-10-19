import { prisma } from "@/lib/prisma";
import { GOAL_INCLUDE, GoalInput, dbError, goalData, parseBody } from "@/lib/household-api";

export async function GET() {
  return Response.json(await prisma.goal.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }], include: GOAL_INCLUDE }));
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, GoalInput.partial().required({ name: true, template: true }));
  if ("error" in parsed) return parsed.error;
  const { accounts, contributions, ...rest } = goalData(parsed.data);
  try {
    const goal = await prisma.goal.create({
      data: {
        targetAmount: 0,
        ...rest,
        name: parsed.data.name,
        template: parsed.data.template,
        ...(accounts ? { accounts: { create: accounts.create } } : {}),
        ...(contributions ? { contributions: { create: contributions.create } } : {}),
      },
      include: GOAL_INCLUDE,
    });
    return Response.json(goal, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
