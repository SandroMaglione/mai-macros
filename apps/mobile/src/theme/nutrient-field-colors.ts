import type { Reporting } from "@mai/nutrition";
import { color } from "./tokens";

export const nutrientFieldColors = {
  energyKcal: color.nutritionEnergy,
  proteinGrams: color.nutritionProtein,
  carbsGrams: color.nutritionCarbs,
  fatGrams: color.nutritionFat,
  fiberGrams: color.nutritionFiber,
  sugarGrams: color.nutritionCarbs,
  saturatedFatGrams: color.nutritionFat,
  saltGrams: color.nutritionSalt,
} satisfies Record<Reporting.NutrientName, string>;
