import type { Reporting } from "@mai/nutrition";
import { formatNumber } from "./format";

export type NutrientDisplayMode = "consumed" | "remaining";

export function nutrientTotalDisplay({
  nutrition,
  name,
  target,
  mode = "consumed",
}: {
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly name: Reporting.NutrientName;
  readonly target?: number;
  readonly mode?: NutrientDisplayMode;
}) {
  const value = nutrition.totals[name];
  const unknown = nutrition.entriesCount > 0 && nutrition.coverage[name] === 0;
  const incomplete = nutrition.missing[name] > 0;
  const estimated = nutrition.estimatedCoverage[name] > 0;
  const remaining = mode === "remaining" && target !== undefined;
  const amount = remaining ? Math.abs(target - value) : value;
  return {
    amount: unknown
      ? "—"
      : `${estimated || incomplete ? "≈ " : ""}${remaining && value > target ? "-" : ""}${formatNutrientAmount({ value: amount, maximumFractionDigits: name === "energyKcal" ? 0 : 1 })}`,
    targetState:
      unknown || target === undefined
        ? ("unavailable" as const)
        : value > target
          ? ("over" as const)
          : value === target
            ? ("reached" as const)
            : ("below" as const),
    estimatedAmount: nutrition.estimated[name],
    incomplete,
    unknown,
    value,
  };
}

export function formatNutrientAmount({
  value,
  maximumFractionDigits = 1,
}: {
  readonly value: number;
  readonly maximumFractionDigits?: number;
}): string {
  return formatNumber({ maximumFractionDigits, value });
}
