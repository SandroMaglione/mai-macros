import { insightNutrients } from "../constants.ts";
import { sortedByScore } from "../selection.ts";
import type {
  FoodInsightContributor,
  InsightContext,
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "../types.ts";

const minimumRepeatedFoodQuantityGrams = 100;
const minimumRepeatedFoodCalorieShare = 0.05;
const minimumRepeatedFoodNutrientShare = 0.12;

export const repeatedFoodInsightModule = {
  id: "repeated-food",
  defaultSummaryLimit: 0,
  collect: (context) => {
    const repeatedFoodThreshold = Math.max(
      3,
      Math.ceil(context.dayCount * 0.7)
    );

    return sortedByScore({
      insights: context.foodContributors.flatMap((food) => {
        const calorieShare = _calorieShare({ context, food });
        const isSignificant =
          food.quantityGrams >= minimumRepeatedFoodQuantityGrams ||
          calorieShare >= minimumRepeatedFoodCalorieShare ||
          insightNutrients.some((nutrientName) => {
            if (nutrientName === "energyKcal") {
              return false;
            }

            const total = context.totals[nutrientName];

            return (
              total > 0 &&
              food.totals[nutrientName] / total >=
                minimumRepeatedFoodNutrientShare
            );
          });

        if (!isSignificant) {
          return [];
        }

        const dayFrequency = Object.keys(food.daysByDateKey).length;
        const repeatedMeal = Object.entries(food.mealsByName)
          .map(([mealId, daysByDateKey]) => ({
            dayFrequency: Object.keys(daysByDateKey).length,
            mealId,
          }))
          .filter((meal) => meal.dayFrequency >= repeatedFoodThreshold)
          .sort((left, right) => right.dayFrequency - left.dayFrequency)[0];

        if (
          repeatedMeal !== undefined &&
          repeatedMeal.dayFrequency >= dayFrequency * 0.75
        ) {
          return [
            {
              id: `repeated-food-${food.foodId}-${repeatedMeal.mealId}`,
              kind: "repeated-food",
              parts: [
                { text: food.name, tone: "food" },
                { text: " appeared at ", tone: "text" },
                {
                  text: context
                    .mealLabel({ mealId: repeatedMeal.mealId })
                    .toLocaleLowerCase(),
                  tone: "meal",
                },
                {
                  text: ` on ${repeatedMeal.dayFrequency} of ${context.dayCount} days.`,
                  tone: "text",
                },
              ],
              score:
                repeatedMeal.dayFrequency / context.dayCount +
                _significanceScore({ context, food }),
            } satisfies NutritionReportInsight,
          ];
        }

        if (dayFrequency < repeatedFoodThreshold) {
          return [];
        }

        return [
          {
            id: `repeated-food-${food.foodId}`,
            kind: "repeated-food",
            parts: [
              { text: food.name, tone: "food" },
              {
                text: ` appeared on ${dayFrequency} of ${context.dayCount} days.`,
                tone: "text",
              },
            ],
            score:
              dayFrequency / context.dayCount +
              _significanceScore({ context, food }),
          } satisfies NutritionReportInsight,
        ];
      }),
    });
  },
} satisfies NutritionReportInsightModule;

function _significanceScore({
  context,
  food,
}: {
  readonly context: InsightContext;
  readonly food: FoodInsightContributor;
}): number {
  return Math.min(0.25, _calorieShare({ context, food }));
}

function _calorieShare({
  context,
  food,
}: {
  readonly context: InsightContext;
  readonly food: FoodInsightContributor;
}): number {
  return context.totals.energyKcal <= 0
    ? 0
    : food.totals.energyKcal / context.totals.energyKcal;
}
