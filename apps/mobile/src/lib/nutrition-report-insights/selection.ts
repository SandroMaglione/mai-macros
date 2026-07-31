import { MutableHashSet } from "effect";

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
  const selected = [...selectedByPriority];
  const selectedIds = MutableHashSet.fromIterable(
    selected.map((insight) => insight.id)
  );

  for (const candidate of allCandidates) {
    if (selected.length >= limit) {
      break;
    }

    if (MutableHashSet.has(selectedIds, candidate.id)) {
      continue;
    }

    selected.push(candidate);
    MutableHashSet.add(selectedIds, candidate.id);
  }

  return selected;
}
