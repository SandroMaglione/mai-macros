import { insightNutrients, nutrientInsightLabels } from "../constants.ts";
import { sortedByScore } from "../selection.ts";
import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "../types.ts";

export const nutrientConcentrationInsightModule = {
  id: "nutrient-concentration",
  defaultSummaryLimit: 1,
  collect: (context) =>
    sortedByScore({
      insights: insightNutrients.flatMap((nutrientName) => {
        const total = context.totals[nutrientName];
        const topFoods = context.foodContributors
          .filter((food) => food.totals[nutrientName] > 0)
          .sort(
            (left, right) =>
              right.totals[nutrientName] - left.totals[nutrientName]
          )
          .slice(0, 2);
        const firstFood = topFoods[0];
        const secondFood = topFoods[1];

        if (total <= 0 || firstFood === undefined || secondFood === undefined) {
          return [];
        }

        const share =
          (firstFood.totals[nutrientName] + secondFood.totals[nutrientName]) /
          total;

        if (share < 0.5) {
          return [];
        }

        return [
          {
            id: `nutrient-concentration-${nutrientName}`,
            kind: "nutrient-concentration",
            parts: [
              {
                text: `Most of your ${nutrientInsightLabels[nutrientName]} came from `,
                tone: "text",
              },
              { text: firstFood.name, tone: "food" },
              { text: " and ", tone: "text" },
              { text: secondFood.name, tone: "food" },
              {
                text: ` (${context.formatPercent({ share })}).`,
                tone: "text",
              },
            ],
            score: share,
          } satisfies NutritionReportInsight,
        ];
      }),
    }),
} satisfies NutritionReportInsightModule;
