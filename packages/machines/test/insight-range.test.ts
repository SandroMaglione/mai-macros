import { Option, Schema } from "effect";
import { assert, describe, it } from "vitest";
import {
  InsightDateRange,
  insightRangeDayCount,
} from "../src/insight-range.ts";

describe("custom insight ranges", () => {
  it.each([
    ["2026-09-05", "2026-09-05", 1],
    ["2026-08-31", "2026-09-05", 6],
    ["2024-02-28", "2024-03-01", 3],
    ["2026-03-28", "2026-03-30", 3],
    ["2026-10-24", "2026-10-26", 3],
    ["2025-12-31", "2026-01-01", 2],
  ] as const)(
    "counts %s through %s inclusively",
    (startDateKey, endDateKey, days) => {
      const range = Schema.decodeOption(InsightDateRange)({
        startDateKey,
        endDateKey,
      });
      assert(Option.isSome(range));
      assert.equal(insightRangeDayCount(range.value), days);
    }
  );

  it.each([
    ["2026-09-06", "2026-09-05"],
    ["2026-02-29", "2026-03-01"],
    ["2026-04-31", "2026-05-01"],
    ["2026-00-01", "2026-09-05"],
    ["2026-09-01", "2026-13-01"],
    ["2026-9-1", "2026-09-05"],
    ["", "2026-09-05"],
  ])("rejects invalid range %s through %s", (startDateKey, endDateKey) => {
    assert(
      Option.isNone(
        Schema.decodeOption(InsightDateRange)({ startDateKey, endDateKey })
      )
    );
  });
});
