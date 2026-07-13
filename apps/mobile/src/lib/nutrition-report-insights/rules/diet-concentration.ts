import { sortedByScore } from "../selection.ts";
import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "../types.ts";

export const dietConcentrationInsightModule = {
  id: "diet-concentration",
  defaultSummaryLimit: 0,
  collect: (context) =>
    sortedByScore({
      insights: (() => {
        const calorieFoods = context.foodContributors
          .filter((food) => food.totals.energyKcal > 0)
          .sort(
            (left, right) => right.totals.energyKcal - left.totals.energyKcal
          );

        if (context.totals.energyKcal <= 0 || calorieFoods.length < 5) {
          return [];
        }

        const topFoodCount = 5;
        const share =
          calorieFoods
            .slice(0, topFoodCount)
            .reduce((total, food) => total + food.totals.energyKcal, 0) /
          context.totals.energyKcal;

        if (share < 0.6) {
          return [];
        }

        return [
          {
            id: "diet-concentration-calories",
            kind: "diet-concentration",
            parts: [
              {
                text: `Your top ${topFoodCount} foods made up ${context.formatPercent(
                  {
                    share,
                  }
                )} of calories in this period.`,
                tone: "text",
              },
            ],
            score: share,
          } satisfies NutritionReportInsight,
        ];
      })(),
    }),
} satisfies NutritionReportInsightModule;
