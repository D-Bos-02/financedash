import { describe, expect, it } from "vitest";
import { formatDate, formatMonth } from "./formatters";

describe("calendar date formatting", () => {
  it("shows the stored date, whatever the viewer's time zone", () => {
    expect(formatDate("2026-10-18T00:00:00.000Z")).toBe("Oct 18, 2026");
    expect(formatMonth("2026-05-01")).toBe("May 2026");
  });
});
