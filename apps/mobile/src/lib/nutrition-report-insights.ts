import { NutritionReports } from "@mai/nutrition";

import { buildInsightContext } from "./nutrition-report-insights/context.ts";
import { dietConcentrationInsightModule } from "./nutrition-report-insights/rules/diet-concentration.ts";
import { foodContributionInsightModule } from "./nutrition-report-insights/rules/food-contribution.ts";
import { mealBalanceInsightModule } from "./nutrition-report-insights/rules/meal-balance.ts";
import { nutrientConcentrationInsightModule } from "./nutrition-report-insights/rules/nutrient-concentration.ts";
import { repeatedFoodInsightModule } from "./nutrition-report-insights/rules/repeated-food.ts";
import { targetDeviationInsightModule } from "./nutrition-report-insights/rules/target-deviation.ts";
import { volumeDensityInsightModule } from "./nutrition-report-insights/rules/volume-density.ts";
import { selectNutritionReportInsights } from "./nutrition-report-insights/selection.ts";
import type {
  NutritionReportInsight,
  NutritionReportInsightModule,
} from "./nutrition-report-insights/types.ts";

export type {
  NutritionReportInsight,
  NutritionReportInsightKind,
  NutritionReportInsightPart,
} from "./nutrition-report-insights/types.ts";

const nutritionReportInsightModules = [
  foodContributionInsightModule,
  mealBalanceInsightModule,
  volumeDensityInsightModule,
  targetDeviationInsightModule,
  nutrientConcentrationInsightModule,
  dietConcentrationInsightModule,
  repeatedFoodInsightModule,
] as const satisfies readonly NutritionReportInsightModule[];

export function getNutritionReportInsights({
  limit,
  report,
}: {
  readonly limit: number;
  readonly report: NutritionReports.NutritionReportRange;
}): readonly NutritionReportInsight[] {
  const context = buildInsightContext({ report });
  const moduleResults = nutritionReportInsightModules.map((insightModule) => ({
    insights: insightModule.collect(context),
    insightModule,
  }));

  return selectNutritionReportInsights({
    limit,
    moduleResults,
  });
}
