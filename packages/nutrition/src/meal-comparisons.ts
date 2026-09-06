import { Array, Schema } from "effect";
import {
  MealId,
  type DateKey,
  type Food,
  type MealEntry,
  type PlanId,
} from "./domain.ts";
import * as Reporting from "./reporting.ts";
import type { NutritionReportRange } from "./services/nutrition-reports.ts";

export const LOOKBACK_DAYS = 7;
export const Metric = Schema.Literals([
  ...Reporting.NutrientNames,
  "weightGrams",
  "gramsPerCalorie",
  "costEur",
]);
export type Metric = typeof Metric.Type;

export const Baseline = Schema.Struct({
  mealId: MealId,
  mealCount: Schema.Number,
  metrics: Schema.Array(
    Schema.Struct({
      metric: Metric,
      average: Schema.NullOr(Schema.Number),
      meals: Schema.Number,
      estimated: Schema.Boolean,
    })
  ),
});
export type Baseline = typeof Baseline.Type;

export type MetricValue = {
  readonly metric: Metric;
  readonly value: number | null;
  readonly estimated: boolean;
};

export function mealValues({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
}): readonly MetricValue[] {
  const nutrition = Reporting.calculateMealEntriesNutrientTotals({
    foods,
    mealEntries,
  });
  const weight = Reporting.calculateMealEntriesWeightTotals({
    foods,
    mealEntries,
  });
  const cost = Reporting.calculateMealEntriesCostTotals({ foods, mealEntries });
  const hasEntries = Array.isReadonlyArrayNonEmpty(mealEntries);
  const weightKnown =
    hasEntries && weight.resolvedEntriesCount === mealEntries.length;
  const energyKnown =
    hasEntries &&
    nutrition.missing.energyKcal === 0 &&
    nutrition.coverage.energyKcal > 0;
  const euroCostKnown =
    hasEntries &&
    cost.resolvedEntriesCount === mealEntries.length &&
    mealEntries.every(
      (entry) =>
        entry.kind === "catalog" &&
        foods
          .find((food) => food.id === entry.foodId)
          ?.prices.find((price) => price.isCurrent)?.currency === "EUR"
    );
  return [
    ...Reporting.NutrientNames.map((metric) => ({
      metric,
      value:
        hasEntries &&
        nutrition.missing[metric] === 0 &&
        nutrition.coverage[metric] > 0
          ? nutrition.totals[metric]
          : null,
      estimated: nutrition.estimatedCoverage[metric] > 0,
    })),
    {
      metric: "weightGrams",
      value: weightKnown ? weight.quantityGrams : null,
      estimated: false,
    },
    {
      metric: "gramsPerCalorie",
      value:
        weightKnown && energyKnown
          ? Reporting.calculateGramsPerCalorie({
              energyKcal: nutrition.totals.energyKcal,
              quantityGrams: weight.quantityGrams,
            })
          : null,
      estimated: nutrition.estimatedCoverage.energyKcal > 0,
    },
    {
      metric: "costEur",
      value: euroCostKnown ? cost.costMinorByCurrency.EUR / 100 : null,
      estimated: false,
    },
  ];
}

export function buildBaselines({
  report,
  dateKey,
  planId,
}: {
  readonly report: NutritionReportRange;
  readonly dateKey: DateKey;
  readonly planId: PlanId;
}): readonly Baseline[] {
  const days = report.days.filter((day) => {
    const age = (Date.parse(dateKey) - Date.parse(day.dateKey)) / 86_400_000;
    return (
      age >= 1 &&
      age <= LOOKBACK_DAYS &&
      day.plan.id === planId &&
      day.dailyLog.mode === "eating"
    );
  });
  const mealIds = days
    .flatMap((day) => day.mealEntries.map((entry) => entry.mealId))
    .filter((id, index, ids) => ids.indexOf(id) === index);
  return mealIds.map((mealId) => {
    const meals = days.flatMap((day) => {
      const mealEntries = day.mealEntries.filter(
        (entry) => entry.mealId === mealId
      );
      return !Array.isReadonlyArrayNonEmpty(mealEntries)
        ? []
        : [
            mealValues({
              foods: day.entries.flatMap((entry) =>
                entry.food === null ? [] : [entry.food]
              ),
              mealEntries,
            }),
          ];
    });
    return {
      mealId,
      mealCount: meals.length,
      metrics: Metric.literals.map((metric) => {
        const values = meals.flatMap((meal) =>
          meal.filter(
            (value) => value.metric === metric && value.value !== null
          )
        );
        return {
          metric,
          average: !Array.isReadonlyArrayNonEmpty(values)
            ? null
            : values.reduce((total, value) => total + (value.value ?? 0), 0) /
              values.length,
          meals: values.length,
          estimated: values.some((value) => value.estimated),
        };
      }),
    };
  });
}

export function percentageDifference({
  value,
  average,
}: {
  readonly value: number | null;
  readonly average: number | null;
}): number | null {
  if (value === null || average === null) return null;
  if (average === 0) return value === 0 ? 0 : null;
  return ((value - average) / average) * 100;
}
