import { Reporting } from "@mai/nutrition";

import { sortedByScore } from "../selection.ts";
import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "../types.ts";

export const mealBalanceInsightModule = {
  id: "meal-balance",
  defaultSummaryLimit: 1,
  collect: (context) =>
    sortedByScore({
      insights: [
        ...context.mealContributors.flatMap((meal) => {
          if (context.totals.energyKcal <= 0 || meal.totals.energyKcal <= 0) {
            return [];
          }

          const share = meal.totals.energyKcal / context.totals.energyKcal;

          if (share < 0.45) {
            return [];
          }

          return [
            {
              id: `meal-calories-${meal.mealId}`,
              kind: "meal-imbalance",
              parts: [
                { text: meal.mealLabel, tone: "meal" },
                {
                  text: ` made up ${context.formatPercent({
                    share,
                  })} of your calories in this period.`,
                  tone: "text",
                },
              ],
              score: share,
            } satisfies NutritionReportInsight,
          ];
        }),
        ...context.mealContributors.flatMap((meal) => {
          const otherMeals = context.mealContributors.filter(
            (otherMeal) => otherMeal.mealId !== meal.mealId
          );
          const otherTotals = otherMeals.reduce<Reporting.NutrientTotals>(
            (currentTotals, otherMeal) =>
              Reporting.addNutrientTotals({
                left: currentTotals,
                right: otherMeal.totals,
              }),
            Reporting.emptyNutrientTotals()
          );
          const mealProteinDensity =
            meal.totals.energyKcal <= 0
              ? 0
              : meal.totals.proteinGrams / meal.totals.energyKcal;
          const otherProteinDensity =
            otherTotals.energyKcal <= 0
              ? 0
              : otherTotals.proteinGrams / otherTotals.energyKcal;
          const calorieShare =
            context.totals.energyKcal <= 0
              ? 0
              : meal.totals.energyKcal / context.totals.energyKcal;

          if (
            calorieShare < 0.1 ||
            otherProteinDensity <= 0 ||
            mealProteinDensity >= otherProteinDensity * 0.65
          ) {
            return [];
          }

          return [
            {
              id: `meal-protein-density-${meal.mealId}`,
              kind: "meal-imbalance",
              parts: [
                { text: meal.mealLabel, tone: "meal" },
                {
                  text: " had much less protein per calorie than your other meals.",
                  tone: "text",
                },
              ],
              score:
                (otherProteinDensity - mealProteinDensity) /
                otherProteinDensity,
            } satisfies NutritionReportInsight,
          ];
        }),
      ],
    }),
} satisfies NutritionReportInsightModule;
