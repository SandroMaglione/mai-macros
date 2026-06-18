import type { EntryNutrients, Food, Plan, QuantityGrams } from "./domain.ts";

export const calculateMacronutrientEnergyKcal = ({
  proteinGrams,
  carbsGrams,
  fatGrams,
}: {
  readonly proteinGrams: number;
  readonly carbsGrams: number;
  readonly fatGrams: number;
}): number => proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9;

export const calculatePlanEnergyKcal = ({
  plan,
}: {
  readonly plan: Plan;
}): number =>
  calculateMacronutrientEnergyKcal({
    proteinGrams: plan.proteinTargetGrams,
    carbsGrams: plan.carbsTargetGrams,
    fatGrams: plan.fatTargetGrams,
  });

export const calculateEntryNutrients = ({
  food,
  quantityGrams,
}: {
  readonly food: Food;
  readonly quantityGrams: QuantityGrams;
}): typeof EntryNutrients.Encoded => {
  const multiplier = quantityGrams / 100;

  return {
    energyKcal: food.energyKcalPer100g * multiplier,
    proteinGrams: food.proteinGramsPer100g * multiplier,
    carbsGrams: food.carbsGramsPer100g * multiplier,
    fatGrams: food.fatGramsPer100g * multiplier,
    fiberGrams: food.fiberGramsPer100g * multiplier,
    sugarGrams: food.sugarGramsPer100g * multiplier,
    saturatedFatGrams: food.saturatedFatGramsPer100g * multiplier,
    saltGrams: food.saltGramsPer100g * multiplier,
  };
};
