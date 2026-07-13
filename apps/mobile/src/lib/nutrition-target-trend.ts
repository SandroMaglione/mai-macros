import type { Reporting } from "@mai/nutrition";

export type NutritionTargetTrend = "above" | "below" | "inside";

export const nutritionTargetTrendMarginFraction = 0.05;

export function getNutritionTargetTrend({
  actual,
  target,
}: {
  readonly actual: number;
  readonly target: number;
}): NutritionTargetTrend {
  return target <= 0
    ? actual > 0
      ? "above"
      : "inside"
    : actual >= target * (1 + nutritionTargetTrendMarginFraction)
      ? "above"
      : actual <= target * (1 - nutritionTargetTrendMarginFraction)
        ? "below"
        : "inside";
}

export function isInsideNutritionTargetMargin({
  actual,
  semantics,
  target,
}: {
  readonly actual: number;
  readonly semantics: Reporting.NutrientTargetSemantics;
  readonly target: number;
}): boolean {
  const trend = getNutritionTargetTrend({ actual, target });

  return semantics === "minimum"
    ? trend !== "below"
    : semantics === "maximum"
      ? trend !== "above"
      : trend === "inside";
}
