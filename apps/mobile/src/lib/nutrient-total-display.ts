import { Reporting } from "@mai/nutrition";
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
  readonly target?: Reporting.NutrientTarget;
  readonly mode?: NutrientDisplayMode;
}) {
  const value = nutrition.totals[name];
  const unknown = nutrition.entriesCount > 0 && nutrition.coverage[name] === 0;
  const incomplete = nutrition.missing[name] > 0;
  const estimated = nutrition.estimatedCoverage[name] > 0;
  const remaining = mode === "remaining" && target !== undefined;
  const signedAmount = remaining
    ? Reporting.remainingNutrientTargetAmount({ target, value })
    : value;
  const amount = Math.abs(signedAmount);
  const status =
    target === undefined
      ? undefined
      : Reporting.evaluateNutrientTarget({ target, value }).status;
  const uncertainStatus = incomplete && status !== "above";
  return {
    amount: unknown
      ? "—"
      : `${estimated || incomplete ? "≈ " : ""}${remaining && signedAmount < 0 ? "-" : ""}${formatNutrientAmount({ value: amount, maximumFractionDigits: name === "energyKcal" ? 0 : 1 })}`,
    targetState:
      unknown || target === undefined || uncertainStatus
        ? ("unavailable" as const)
        : status === "above"
          ? ("over" as const)
          : status === "inside"
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
