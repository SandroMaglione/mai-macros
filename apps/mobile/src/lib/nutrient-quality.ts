import type { Domain, Reporting } from "@mai/nutrition";
import { formatNumber } from "./format";

export const nutrientLabels = {
  energyKcal: "Calories · kcal",
  proteinGrams: "Protein · g",
  carbsGrams: "Carbs · g",
  fatGrams: "Fat · g",
  fiberGrams: "Fiber · g",
  sugarGrams: "Sugar · g",
  saturatedFatGrams: "Saturated fat · g",
  saltGrams: "Salt · g",
} satisfies Record<Reporting.NutrientName, string>;

export function formatNutrientValue(nutrient: Domain.NutrientValue): string {
  return nutrient._tag === "Unknown"
    ? "—"
    : `${nutrient._tag === "Estimated" ? "≈ " : ""}${formatNumber({ value: nutrient.value, maximumFractionDigits: 1 })}`;
}

export function hasNutrientUncertainty(
  nutrition: Reporting.MealEntriesNutrientTotals
): boolean {
  return (
    Object.values(nutrition.estimatedCoverage).some((count) => count > 0) ||
    Object.values(nutrition.missing).some((count) => count > 0)
  );
}
