import { describe, expect, it } from "vitest";
import { formatTime, parseDateTimeInGmt8, toDateTimeLocalValue } from "./format";

describe("GMT+8 time formatting", () => {
  it("formats UTC timestamps as GMT+8 for datetime-local inputs", () => {
    expect(toDateTimeLocalValue("2026-07-23T00:30:00.000Z")).toBe("2026-07-23T08:30");
  });

  it("parses datetime-local values as GMT+8 regardless of browser timezone", () => {
    expect(parseDateTimeInGmt8("2026-07-23T08:30").toISOString()).toBe("2026-07-23T00:30:00.000Z");
  });

  it("labels displayed timestamps with GMT+8", () => {
    const formatted = formatTime("2026-07-23T00:30:00.000Z");
    expect(formatted).toContain("08:30");
    expect(formatted).toContain("GMT+08:00");
  });
});
