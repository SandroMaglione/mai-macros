export const dailySummaryNutrients = [
  { name: "energyKcal", label: "Calories" },
  { name: "carbsGrams", label: "Carbs" },
  { name: "proteinGrams", label: "Protein" },
  { name: "fatGrams", label: "Fat" },
  { name: "fiberGrams", label: "Fiber" },
  { name: "sugarGrams", label: "Sugar" },
  { name: "saturatedFatGrams", label: "Sat fat" },
  { name: "saltGrams", label: "Salt" },
] as const;

export function summaryPagerSelection(position: number) {
  const index =
    (position - 1 + dailySummaryNutrients.length) %
    dailySummaryNutrients.length;
  return {
    nutrient: dailySummaryNutrients[index] ?? dailySummaryNutrients[0],
    page: index + 1,
  };
}
