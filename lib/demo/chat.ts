// The hosted demo's chat assistant: no AI model, just scripted answers to the questions in questions.ts.
// Each answer runs the same tools the real assistant uses, on the visitor's own copy of the data, so the
// numbers match the dashboard even after they change something. The transcript is saved in the
// OpenAI-compatible format, tool calls included, so it reads back like a real chat.

import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { OAIMessage } from "@/lib/chat/openai";
import { WEEKLY_CHECKIN_PROMPT, type ChatEvent, type ChatUsage } from "@/lib/chat/types";
import { prisma } from "@/lib/prisma";
import { loadToBase } from "@/lib/fx";
import { netWorthAt } from "@/lib/net-worth";
import { DEMO_QUESTIONS, matchQuestion, type DemoQuestion } from "./questions";

// Loose shapes of the tool results used here; see lib/chat/tools.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Result = any;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const NO_USAGE: ChatUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export async function runDemoChat(opts: {
  tools: BetaRunnableTool[];
  history: OAIMessage[];
  settings: { baseCurrency: string; locale: string };
  send: (e: ChatEvent) => void;
}): Promise<{ messages: OAIMessage[]; usage: ChatUsage }> {
  const { tools, send, settings } = opts;
  const messages = [...opts.history];
  const last = messages[messages.length - 1];
  const question = last?.role === "user" ? last.content : "";

  const money = (v: number) =>
    new Intl.NumberFormat(settings.locale, { style: "currency", currency: settings.baseCurrency, maximumFractionDigits: 0 }).format(v);
  const monthName = (d: Date, year = false) => d.toLocaleString(settings.locale, { month: "long", ...(year && { year: "numeric" }), timeZone: "UTC" });

  // Runs one tool the way a model would call it, and records the call in the transcript.
  async function call(name: string, input: object = {}): Promise<Result | null> {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return null;
    send({ type: "tool", name });
    const id = `demo_${messages.length}`;
    messages.push({ role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(input) } }] });
    const out = await tool.run(tool.parse(input));
    const content = typeof out === "string" ? out : JSON.stringify(out);
    messages.push({ role: "tool", tool_call_id: id, content });
    await pause(350);
    return JSON.parse(content);
  }

  const answers: Record<DemoQuestion, () => Promise<string>> = {
    async goals() {
      const r = await call("get_goals");
      if (!r.goals.length) return "You haven't set up any goals yet. Add some in **Settings › Goals**, then ask again.";
      const label: Record<string, string> = { on_track: "On track", behind: "Behind", reached: "Reached", no_deadline: "No deadline" };
      const rows = r.goals.map((g: Result) =>
        `| ${g.name} | ${money(g.remaining)} | ${g.needed_per_month === null ? "–" : money(g.needed_per_month)} | ${money(g.planned_per_month)} | ${label[g.status] ?? g.status} |`);
      const onTrack = r.goals.filter((g: Result) => g.status === "on_track" || g.status === "reached").length;
      const behind = r.goals.filter((g: Result) => g.status === "behind");
      const lines = [
        `**${onTrack} of ${r.goals.length} goals are on track.**`,
        "",
        "| Goal | Left to go | Needed / month | Planned / month | Status |",
        "|---|---|---|---|---|",
        ...rows,
        "",
      ];
      for (const g of behind) {
        const short = g.needed_per_month - g.planned_per_month;
        lines.push(`- **${g.name}** needs ${money(g.needed_per_month)} a month to make its ${g.deadline ? `deadline (${monthName(new Date(g.deadline), true)})` : "deadline"}, ` +
          `but the plan puts in ${money(g.planned_per_month)}. ${short > 0 ? `Another ${money(short)} a month would get it back on track.` : ""}`);
      }
      lines.push("", `Altogether you plan ${money(r.total_planned_per_month)} a month toward goals, out of ${money(r.free_cash_per_month_from_pay)} free from pay` +
        (r.left_after_goals >= 0 ? `, which leaves ${money(r.left_after_goals)} a month spare.` : `, which is ${money(-r.left_after_goals)} a month more than you have.`));
      return lines.join("\n");
    },

    async food() {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      const before = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
      const r = await call("get_spending", { start_date: iso(start), end_date: iso(end), category: "Food & Dining", group_by: "merchant", top: 6 });
      const prev = await call("get_spending", { start_date: iso(before), end_date: iso(new Date(start.getTime() - 86_400_000)), category: "Food & Dining" });
      if (!r.total_spent) return `I don't see any Food & Dining spending in ${monthName(start)}.`;
      const diff = r.total_spent - prev.total_spent;
      return [
        `You spent **${money(r.total_spent)}** on food in ${monthName(start)}` +
          (prev.total_spent ? `, ${money(Math.abs(diff))} ${diff >= 0 ? "more" : "less"} than in ${monthName(before)} (${money(prev.total_spent)}).` : "."),
        "",
        "| Where | Spent | Visits |",
        "|---|---|---|",
        ...r.groups.map((g: Result) => `| ${g.merchant} | ${money(g.spent)} | ${g.transactions} |`),
        "",
        `${r.groups[0].merchant} is the biggest share, at ${Math.round((r.groups[0].spent / r.total_spent) * 100)}% of the total.`,
      ].join("\n");
    },

    async netWorth() {
      const r = await call("get_accounts");
      const [toBase, snapshots] = await Promise.all([
        loadToBase(),
        prisma.balanceSnapshot.findMany({ include: { account: { select: { type: true, isActive: true } } } }),
      ]);
      if (!snapshots.length) return `Your net worth is **${money(r.net_worth)}** today. There's no balance history yet to compare it with.`;
      const now = new Date();
      const rows: { label: string; value: number }[] = [];
      for (let back = 11; back >= 0; back--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        if (d.getUTCFullYear() !== now.getUTCFullYear()) continue;
        const v = netWorthAt(snapshots, d, toBase);
        if (v !== null) rows.push({ label: d.toLocaleString(settings.locale, { month: "long", day: "numeric", timeZone: "UTC" }), value: v });
      }
      const first = rows[0];
      const lines = [`Your net worth is **${money(r.net_worth)}** today` +
        (r.unvested_stock_not_counted ? `, not counting ${money(r.unvested_stock_not_counted)} of unvested stock.` : ".")];
      if (first) {
        const change = r.net_worth - first.value;
        const pct = first.value ? Math.round((change / Math.abs(first.value)) * 100) : 0;
        lines.push("", `That's **${change >= 0 ? "up" : "down"} ${money(Math.abs(change))}** (${pct}%) since ${first.label}, the earliest balance history this year.`,
          "", "| Date | Net worth |", "|---|---|", ...rows.map((x) => `| ${x.label} | ${money(x.value)} |`), `| Today | ${money(r.net_worth)} |`);
      }
      const owners = Object.entries(r.by_owner as Record<string, number>).sort(([, a], [, b]) => b - a);
      if (owners.length > 1) lines.push("", `By owner: ${owners.map(([o, v]) => `${o === "shared" ? "shared accounts" : o} ${money(v)}`).join(", ")}.`);
      return lines.join("\n");
    },

    async thisMonth() {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const r = await call("get_spending", { start_date: iso(start), end_date: iso(now), group_by: "category", top: 6 });
      if (!r.total_spent) return `Nothing has been spent yet in ${monthName(start)}.`;
      const top = r.groups[0];
      return [
        `So far in ${monthName(start)} (${now.getUTCDate()} days in) you've spent **${money(r.total_spent)}**, leaving out transfers between your own accounts.`,
        "",
        "| Category | Spent | Share |",
        "|---|---|---|",
        ...r.groups.map((g: Result) => `| ${g.category} | ${money(g.spent)} | ${Math.round((g.spent / r.total_spent) * 100)}% |`),
        "",
        `**${top.category}** is the biggest, at ${money(top.spent)}.` +
          (top.category === "Housing" ? " That's mostly rent, so the next one along is where day-to-day spending goes." : ""),
      ].join("\n");
    },

    async home() {
      const r = await call("run_home_plan");
      if (!r) return "You don't have a home goal yet. Add one in **Settings › Goals** (choose *Home purchase*), then ask again.";
      const lines = [
        `For a **${money(r.assumptions.price)}** home you'd need about **${money(r.cash_needed.total)}** in cash: ` +
          `${money(r.cash_needed.deposit)} deposit (${r.assumptions.deposit_pct}%), ${money(r.cash_needed.closing)} closing costs and a reserve.`,
        "",
        `You have **${money(r.available_now.total)}** available now (savings after tax on selling investments` +
          (r.available_now.contributions_to_come ? `, plus ${money(r.available_now.contributions_to_come)} in contributions to come` : "") + ").",
      ];
      if (r.gap <= 0) {
        lines.push("", "**That already covers it**, so the timing is down to the monthly cost of owning (below).");
      } else {
        lines.push("", `That leaves a gap of **${money(r.gap)}**. Here's what closing it from pay would take:`, "",
          "| Buy in | Stock vests before then | Needed from pay / month | Left over / month |", "|---|---|---|---|",
          ...[...r.timeframes].sort((a: Result, b: Result) => a.months - b.months).map((t: Result) => `| ${t.months} months | ${money(t.equity_vests_before_deadline)} | ${money(t.savings_needed_per_month_from_pay)} | ${money(t.spare_pay_per_month)} |`));
        const doable = r.timeframes.filter((t: Result) => t.spare_pay_per_month >= 0).sort((a: Result, b: Result) => a.months - b.months)[0];
        lines.push("", doable
          ? `With about ${money(r.free_cash_per_month)} a month free from pay, **${doable.months} months is realistic**.`
          : `With about ${money(r.free_cash_per_month)} a month free from pay, none of these timeframes fit yet: a cheaper home or a later date would.`);
      }
      const after = r.after_purchase_monthly;
      lines.push("", `After buying, owning would cost about **${money(after.total_cost_of_owning)} a month** (mortgage, tax, insurance and upkeep), ` +
        `${money(Math.abs(after.more_than_current_rent_by))} ${after.more_than_current_rent_by >= 0 ? "more" : "less"} than your rent, ` +
        `leaving about ${money(after.free_cash_per_month_after_buying)} a month free.`);
      return lines.join("\n");
    },

    async income() {
      const r = await call("get_plan");
      const pay = r.take_home_pay_monthly;
      if (!pay.sources.length) return "There's no income set up yet. Add your pay in **Settings › Income**, then ask again.";
      const b = r.monthly_budget;
      const basis = (text: string) => text.startsWith("median") ? "Last 3 paychecks" : text.startsWith("average") ? "3-month average" : "Estimate";
      const free = pay.total - b.rent - b.lifestyle - b.retirement_contributions;
      const lines = [
        `You take home about **${money(pay.total)} a month** from regular pay.`,
        "",
        "| Who | Source | Monthly | Based on |",
        "|---|---|---|---|",
        ...pay.sources.map((s: Result) => `| ${s.member} | ${s.source} | ${money(s.monthly)} | ${basis(s.basis)} |`),
      ];
      for (const e of r.equity) {
        const next = e.upcoming[0];
        lines.push("", `On top of that, ${e.member}'s ${e.source.toLowerCase()} pays about ${money(e.per_year_after_tax)} a year after tax` +
          (next ? `; the next vest is in ${next.month} (about ${money(next.amount)}).` : "."));
      }
      lines.push("", `After rent (${money(b.rent)}), everyday spending (${money(b.lifestyle)}) and retirement contributions (${money(b.retirement_contributions)}), ` +
        `that leaves about **${money(free)} a month** for your goals.`);
      return lines.join("\n");
    },

    async checkin() {
      const r = await call("get_weekly_checkin");
      const w = r.last_7_days;
      const m = r.month_to_date;
      const nw = r.net_worth;
      const behind = r.goals.each.filter((g: Result) => g.status === "behind");
      const lines = [
        "## Weekly check-in",
        "",
        nw.change === null
          ? `**Net worth:** ${nw.now === null ? "not enough history yet" : money(nw.now)}. ${nw.note}`
          : `**Net worth:** ${money(nw.now)}, ${nw.change >= 0 ? "up" : "down"} ${money(Math.abs(nw.change))} on last week.`,
        "",
        `**Last 7 days:** ${money(w.lifestyle_spent)} on day-to-day spending against a weekly budget of ${money(w.weekly_lifestyle_budget)}, ` +
          `so ${money(Math.abs(w.over_under))} ${w.over_under > 0 ? "over" : "under"}.` +
          (w.top_categories.length ? ` Most of it went on ${w.top_categories.slice(0, 3).map((c: Result) => `${c.category} (${money(c.amount)})`).join(", ")}.` : ""),
        "",
        `**This month so far (day ${m.day}):** ${money(m.pay)} of pay in, ${money(m.lifestyle)} of day-to-day spending against ${money(m.lifestyle_plan_prorated)} planned to date.`,
        "",
        `**Goals:** ${r.goals.each.length - behind.length} of ${r.goals.each.length} on track.` +
          (behind.length ? ` Behind: ${behind.map((g: Result) => `${g.goal} (needs ${money(g.needed_per_month)} a month, planned ${money(g.planned_per_month)})`).join("; ")}.` : ""),
      ];
      if (r.goals.next_equity_vest) lines.push("", `**Next stock vest:** ${r.goals.next_equity_vest.month}, about ${money(r.goals.next_equity_vest.amount)} after tax.`);
      return lines.join("\n");
    },
  };

  const which = matchQuestion(question);
  const text = which
    ? await answers[which]()
    : [
        "This demo answers a few set questions, using the demo household's numbers. Try one of these:",
        "",
        ...Object.values(DEMO_QUESTIONS).map((q) => `- ${q}`),
        `- ${WEEKLY_CHECKIN_PROMPT}`,
        "",
        "In your own copy, the assistant uses the AI provider you choose (Anthropic, OpenAI, Google Gemini, OpenRouter, " +
          "or a model on your own computer) and can answer anything about your data.",
      ].join("\n");

  // Stream it a few words at a time, like a model would.
  const words = text.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 4) {
    send({ type: "text", text: words.slice(i, i + 4).join("") });
    await pause(18);
  }
  messages.push({ role: "assistant", content: text });
  return { messages, usage: NO_USAGE };
}
