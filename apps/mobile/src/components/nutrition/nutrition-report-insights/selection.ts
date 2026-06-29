import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "./types.ts";

export function sortedByScore({
  insights,
}: {
  readonly insights: readonly NutritionReportInsight[];
}): readonly NutritionReportInsight[] {
  return [...insights].sort((left, right) => right.score - left.score);
}

export function selectNutritionReportInsights({
  limit,
  moduleResults,
}: {
  readonly limit: number;
  readonly moduleResults: readonly {
    readonly insights: readonly NutritionReportInsight[];
    readonly insightModule: NutritionReportInsightModule;
  }[];
}): readonly NutritionReportInsight[] {
  const selectedByPriority = moduleResults
    .flatMap(({ insights, insightModule }) =>
      insights.slice(0, insightModule.defaultSummaryLimit)
    )
    .slice(0, limit);
  const allCandidates = moduleResults.flatMap(({ insights }) => insights);

  return allCandidates.reduce<readonly NutritionReportInsight[]>(
    (insights, candidate) => {
      if (
        insights.length >= limit ||
        insights.some((insight) => insight.id === candidate.id)
      ) {
        return insights;
      }

      return [...insights, candidate];
    },
    selectedByPriority
  );
}
