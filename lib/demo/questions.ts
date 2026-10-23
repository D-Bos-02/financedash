import { WEEKLY_CHECKIN_PROMPT } from "@/lib/chat/types";

// The questions the hosted demo's chat can answer (lib/demo/chat.ts), offered as buttons on the Chat page.
export const DEMO_QUESTIONS = {
  goals: "Are we on track for our goals?",
  food: "What did we spend on food last month?",
  netWorth: "How has our net worth changed this year?",
  thisMonth: "Where is most of our money going this month?",
  home: "When could we afford our first home?",
  income: "How much do we take home each month?",
} as const;

export type DemoQuestion = keyof typeof DEMO_QUESTIONS | "checkin";

// Which scripted answer a typed question gets: an exact question, or the first topic it mentions. null = none fits.
const MATCHERS: [DemoQuestion, RegExp][] = [
  ["checkin", /check.?in/i],
  ["home", /(?<!take[ -])\bhome\b|\b(house|mortgage|deposit|down ?payment)\b/i],
  ["goals", /\b(goals?|on track)\b/i],
  ["netWorth", /net ?worth|\bworth\b/i],
  ["income", /\b(earn|income|take.?home|salary|paid|pay)\b/i],
  ["food", /\b(food|eat|eating|dining|restaurants?|groceries|grocery)\b/i],
  ["thisMonth", /\b(spend|spent|spending|money going|expenses?)\b/i],
];

export function matchQuestion(text: string): DemoQuestion | null {
  if (text.trim() === WEEKLY_CHECKIN_PROMPT) return "checkin";
  const exact = (Object.keys(DEMO_QUESTIONS) as (keyof typeof DEMO_QUESTIONS)[]).find((k) => DEMO_QUESTIONS[k] === text.trim());
  return exact ?? MATCHERS.find(([, re]) => re.test(text))?.[0] ?? null;
}
