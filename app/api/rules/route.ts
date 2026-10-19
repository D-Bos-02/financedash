import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rules = await prisma.categoryRule.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return Response.json(rules);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const rule = await prisma.categoryRule.create({
    data: {
      pattern: body.pattern,
      category: body.category,
      subCategory: body.subCategory ?? null,
      isTransfer: body.isTransfer ?? false,
      priority: body.priority ?? 0,
    },
  });
  return Response.json(rule, { status: 201 });
}
