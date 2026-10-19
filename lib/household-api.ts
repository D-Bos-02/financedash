// Server-only: request validation for the profile, member, income source and goal routes.

import { z } from "zod";
import { GOAL_TEMPLATES, INCOME_TYPES, PAY_FREQUENCIES } from "@/lib/household";

const values = <T extends string>(list: readonly { value: T }[]) => list.map((o) => o.value) as [T, ...T[]];
const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date());
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

export const ProfileInput = z.object({
  householdType: z.enum(["solo", "household"]),
  baseCurrency: z.string().regex(/^[A-Z]{3}$/),
  timeZone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  locale: z.string().min(2).max(35),
  onboarded: z.boolean(), // sets onboardedAt
}).partial();

export const MemberInput = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int(),
});

export const IncomeSourceInput = z.object({
  memberId: z.string().nullable(),
  name: z.string().trim().min(1).max(80),
  type: z.enum(values(INCOME_TYPES)),
  payFrequency: z.enum(values(PAY_FREQUENCIES)),
  depositPattern: z.string().trim().max(80).nullable(),
  estimateMonthly: z.number().min(0),
  isActive: z.boolean(),
  ticker: z.string().trim().max(15).nullable(),
  sharesPerVest: z.number().min(0).nullable(),
  vestMonths: z.array(z.number().int().min(1).max(12)).max(12).nullable(),
  taxPct: z.number().min(0).max(100).nullable(),
  priceFallback: z.number().min(0).nullable(),
  priceLive: z.boolean(),
});

export function incomeSourceData(input: Partial<z.infer<typeof IncomeSourceInput>>) {
  const { vestMonths, ticker, ...rest } = input;
  return {
    ...rest,
    ...(ticker !== undefined ? { ticker: ticker ? ticker.toUpperCase() : null } : {}),
    ...(vestMonths !== undefined ? { vestMonths: vestMonths ? JSON.stringify([...new Set(vestMonths)].sort((a, b) => a - b)) : null } : {}),
  };
}

const ContributionInput = z.object({
  memberId: z.string().nullable().default(null),
  label: z.string().trim().min(1).max(80),
  amount: z.number().min(0),
  expectedDate: isoDate.nullable().default(null),
  received: z.boolean().default(false),
});

export const GoalInput = z.object({
  name: z.string().trim().min(1).max(80),
  template: z.enum(values(GOAL_TEMPLATES)),
  targetAmount: z.number().min(0),
  deadline: isoDate.nullable(),
  priority: z.number().int(),
  plannedMonthly: z.number().min(0).nullable(),
  status: z.enum(["active", "achieved", "archived"]),
  details: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])), // replaces the stored details
  accounts: z.array(z.object({ accountId: z.string(), share: z.number().min(0).max(1).default(1) })), // replaces the links
  contributions: z.array(ContributionInput), // replaces the contributions
});

export function goalData(input: Partial<z.infer<typeof GoalInput>>) {
  const { deadline, details, accounts, contributions, ...rest } = input;
  return {
    ...rest,
    ...(deadline !== undefined ? { deadline: toDate(deadline) } : {}),
    ...(details !== undefined ? { details: JSON.stringify(details) } : {}),
    ...(accounts !== undefined ? { accounts: { deleteMany: {}, create: accounts } } : {}),
    ...(contributions !== undefined
      ? { contributions: { deleteMany: {}, create: contributions.map((c) => ({ ...c, expectedDate: toDate(c.expectedDate) })) } }
      : {}),
  };
}

export const GOAL_INCLUDE = { accounts: true, contributions: { orderBy: { createdAt: "asc" as const } } };

// Parse a JSON body against a schema; returns the data or a 400 response.
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<{ data: z.infer<S> } | { error: Response }> {
  const body = await request.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (!result.success) return { error: Response.json({ error: z.prettifyError(result.error) }, { status: 400 }) };
  return { data: result.data };
}

// Prisma errors a client can cause: a missing record, or a link to a member/account that doesn't exist.
export function dbError(err: unknown): Response {
  const code = (err as { code?: string })?.code;
  if (code === "P2025") return Response.json({ error: "Not found" }, { status: 404 });
  if (code === "P2003") return Response.json({ error: "Links to a member or account that doesn't exist" }, { status: 400 });
  throw err;
}
