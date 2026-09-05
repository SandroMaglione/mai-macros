import { Domain } from "@mai/nutrition";
import { Schema } from "effect";

const CalendarDateKey = Domain.DateKey.check(
  Schema.makeFilter((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  })
);

export const InsightDateRange = Schema.Struct({
  startDateKey: CalendarDateKey,
  endDateKey: CalendarDateKey,
}).check(
  Schema.makeFilter(
    ({ startDateKey, endDateKey }) => startDateKey <= endDateKey
  )
);

export type InsightDateRange = typeof InsightDateRange.Type;

export const InsightRangeDayCount = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0)
);

export function insightRangeDayCount(range: InsightDateRange): number {
  return (
    Math.round(
      (Date.parse(`${range.endDateKey}T00:00:00.000Z`) -
        Date.parse(`${range.startDateKey}T00:00:00.000Z`)) /
        86_400_000
    ) + 1
  );
}
