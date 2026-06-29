import { Reporting } from "@mai/nutrition";

export const insightNutrients = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
] as const satisfies readonly Reporting.NutrientName[];

export const nutrientInsightLabels = {
  carbsGrams: "carbs",
  energyKcal: "calories",
  fatGrams: "fat",
  fiberGrams: "fiber",
  proteinGrams: "protein",
  saltGrams: "salt",
  saturatedFatGrams: "saturated fat",
  sugarGrams: "sugar",
} satisfies Record<Reporting.NutrientName, string>;

export const targetDeviationThreshold = 0.05;
