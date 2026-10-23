import { describe, expect, it } from "vitest";
import { DEMO_QUESTIONS, matchQuestion } from "./questions";
import { WEEKLY_CHECKIN_PROMPT } from "@/lib/chat/types";

describe("matchQuestion", () => {
  it("answers every suggested question with its own script", () => {
    for (const [key, text] of Object.entries(DEMO_QUESTIONS)) expect(matchQuestion(text)).toBe(key);
    expect(matchQuestion(WEEKLY_CHECKIN_PROMPT)).toBe("checkin");
  });

  it("matches typed questions by topic", () => {
    expect(matchQuestion("can we buy a house soon?")).toBe("home");
    expect(matchQuestion("how much did we spend at restaurants")).toBe("food");
    expect(matchQuestion("what's my net worth")).toBe("netWorth");
    expect(matchQuestion("what do we earn")).toBe("income");
    expect(matchQuestion("what is our take-home pay?")).toBe("income");
    expect(matchQuestion("where did the money go")).toBe(null);
    expect(matchQuestion("tell me a joke")).toBe(null);
  });
});
