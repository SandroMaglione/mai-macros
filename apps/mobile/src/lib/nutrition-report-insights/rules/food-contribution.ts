import { insightNutrients, nutrientInsightLabels } from "../constants.ts";
import { sortedByScore } from "../selection.ts";
import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "../types.ts";

export const foodContributionInsightModule = {
  id: "food-contribution",
  defaultSummaryLimit: 2,
  collect: (context) =>
    sortedByScore({
      insights: insightNutrients.flatMap((nutrientName) => {
        const total = context.totals[nutrientName];
        const topFood = context.foodContributors
          .filter((food) => food.totals[nutrientName] > 0)
          .sort(
            (left, right) =>
              right.totals[nutrientName] - left.totals[nutrientName]
          )[0];

        if (total <= 0 || topFood === undefined) {
          return [];
        }

        const share = topFood.totals[nutrientName] / total;
        const threshold = nutrientName === "energyKcal" ? 0.2 : 0.25;

        if (share < threshold) {
          return [];
        }

        return [
          {
            id: `food-contribution-${nutrientName}-${topFood.foodId}`,
            kind: "food-contribution",
            parts: [
              { text: topFood.name, tone: "food" },
              {
                text: ` contributed ${context.formatPercent({
                  share,
                })} of your ${nutrientInsightLabels[nutrientName]}.`,
                tone: "text",
              },
            ],
            score: share,
          } satisfies NutritionReportInsight,
        ];
      }),
    }),
} satisfies NutritionReportInsightModule;
