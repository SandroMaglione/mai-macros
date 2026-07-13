import {
  insightNutrients,
  nutrientInsightLabels,
  targetDeviationThreshold,
} from "../constants.ts";
import { sortedByScore } from "../selection.ts";
import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "../types.ts";

export const targetDeviationInsightModule = {
  id: "target-deviation",
  defaultSummaryLimit: 1,
  collect: (context) =>
    sortedByScore({
      insights: insightNutrients.flatMap((nutrientName) => {
        const target = context.averageTargetTotals[nutrientName];

        if (target === null || target <= 0) {
          return [];
        }

        const actual = context.averageTotals[nutrientName];
        const deviationShare = Math.abs(actual - target) / target;

        if (deviationShare < targetDeviationThreshold) {
          return [];
        }

        const direction = actual > target ? "above" : "below";

        return [
          {
            id: `target-deviation-${nutrientName}-${direction}`,
            kind: "target-deviation",
            parts: [
              {
                text: `Your recorded-day average ${nutrientInsightLabels[nutrientName]} was ${context.formatPercent(
                  {
                    share: deviationShare,
                  }
                )} ${direction} target.`,
                tone: "text",
              },
            ],
            score: deviationShare,
          } satisfies NutritionReportInsight,
        ];
      }),
    }),
} satisfies NutritionReportInsightModule;
