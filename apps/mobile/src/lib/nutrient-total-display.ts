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
  const remaining = mode === "remaining" && target !== undefined && !incomplete;
  const amount = remaining ? Math.abs(target - value) : value;
  return {
    amount: unknown
      ? "—"
      : `${estimated ? "≈ " : ""}${remaining && value > target ? "-" : ""}${formatNutrientAmount(amount)}${incomplete ? "+" : ""}`,
    estimatedAmount: nutrition.estimated[name],
    incomplete,
    unknown,
    value,
  };
}

export function formatNutrientAmount(value: number): string {
  return formatNumber({ maximumFractionDigits: value < 10 ? 1 : 0, value });
}
