import { NutritionReports, Reporting, type Domain } from "@mai/nutrition";

export type NutritionReportInsightKind =
  | "diet-concentration"
  | "food-contribution"
  | "food-volume"
  | "meal-imbalance"
  | "nutrient-concentration"
  | "repeated-food"
  | "target-deviation";

export type NutritionReportInsightPart = {
  readonly text: string;
  readonly tone: "food" | "meal" | "text";
};

export type NutritionReportInsight = {
  readonly id: string;
  readonly kind: NutritionReportInsightKind;
  readonly parts: readonly NutritionReportInsightPart[];
  readonly score: number;
};

export type FoodInsightContributor = {
  readonly daysByDateKey: Record<string, true>;
  readonly foodId: Domain.Food["id"];
  readonly mealsByName: Record<string, Record<string, true>>;
  readonly name: string;
  readonly quantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

export type MealInsightContributor = {
  readonly mealId: Domain.MealId;
  readonly mealLabel: string;
  readonly quantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

export type DayVolumeContributor = {
  readonly dateKey: Domain.DateKey;
  readonly energyKcal: number;
  readonly quantityGrams: number;
};

export type InsightContext = {
  readonly averageTargetTotals: Record<Reporting.NutrientName, number | null>;
  readonly averageTotals: Reporting.NutrientTotals;
  readonly dayCount: number;
  readonly dayVolumeContributors: readonly DayVolumeContributor[];
  readonly formatDate: (input: { readonly dateKey: Domain.DateKey }) => string;
  readonly foodContributors: readonly FoodInsightContributor[];
  readonly formatPercent: (input: { readonly share: number }) => string;
  readonly formatWeight: (input: { readonly quantityGrams: number }) => string;
  readonly mealContributors: readonly MealInsightContributor[];
  readonly mealLabel: (input: { readonly mealId: string }) => string;
  readonly report: NutritionReports.NutritionReportRange;
  readonly totalQuantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

export type NutritionReportInsightModule = {
  readonly collect: (
    context: InsightContext
  ) => readonly NutritionReportInsight[];
  readonly defaultSummaryLimit: number;
  readonly id: string;
};
