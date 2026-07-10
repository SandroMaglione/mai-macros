import {
  Measurements,
  NutritionReports,
  Reporting,
  type Domain,
} from "@mai/nutrition";

import { insightNutrients } from "./constants.ts";
import type {
  FoodInsightContributor,
  InsightContext,
  MealInsightContributor,
} from "./types.ts";

export function buildInsightContext({
  report,
}: {
  readonly report: NutritionReports.NutritionReportRange;
}): InsightContext {
  const dayCount = report.days.length;
  const totals = report.days.reduce<Reporting.NutrientTotals>(
    (currentTotals, day) =>
      Reporting.addNutrientTotals({
        left: currentTotals,
        right: day.totals,
      }),
    Reporting.emptyNutrientTotals()
  );
  const totalQuantityGrams = report.days.reduce(
    (rangeTotal, day) =>
      rangeTotal +
      day.entries.reduce(
        (dayTotal, entry) => dayTotal + _entryMassGrams({ entry }),
        0
      ),
    0
  );
  const weightCoverageComplete = report.days.every((day) =>
    day.entries.every(
      (entry) =>
        Measurements.massGramsFromQuantity({
          food: entry.food,
          quantity: entry.mealEntry.quantity,
        }) !== undefined
    )
  );
  const averageTotals =
    dayCount === 0
      ? Reporting.emptyNutrientTotals()
      : Reporting.divideNutrientTotals({
          divisor: dayCount,
          totals,
        });
  const mealLabelsById = report.days.reduce<Record<string, string>>(
    (labels, day) =>
      day.plan.meals.reduce<Record<string, string>>(
        (nextLabels, meal) => ({
          ...nextLabels,
          [meal.id]: meal.name,
        }),
        labels
      ),
    {}
  );
  const mealLabel = ({ mealId }: { readonly mealId: string }) =>
    mealLabelsById[mealId] ?? "Meal";
  const foodContributors = Object.values(
    report.days.reduce<Record<string, FoodInsightContributor>>(
      (contributors, day) =>
        day.entries.reduce<Record<string, FoodInsightContributor>>(
          (nextContributors, entry) => {
            const mealId = entry.mealEntry.mealId;
            const current =
              nextContributors[entry.food.id] ??
              ({
                daysByDateKey: {},
                foodId: entry.food.id,
                mealsByName: {},
                name: entry.food.name,
                quantityGrams: 0,
                totals: Reporting.emptyNutrientTotals(),
              } satisfies FoodInsightContributor);

            return {
              ...nextContributors,
              [entry.food.id]: {
                ...current,
                daysByDateKey: {
                  ...current.daysByDateKey,
                  [day.dateKey]: true,
                },
                mealsByName: {
                  ...current.mealsByName,
                  [mealId]: {
                    ...current.mealsByName[mealId],
                    [day.dateKey]: true,
                  },
                },
                quantityGrams:
                  current.quantityGrams + _entryMassGrams({ entry }),
                totals: Reporting.addNutrientTotals({
                  left: current.totals,
                  right: _entryTotals({ entry }),
                }),
              },
            };
          },
          contributors
        ),
      {}
    )
  );
  const mealContributors = Object.values(
    report.days.reduce<Record<string, MealInsightContributor>>(
      (contributors, day) =>
        day.entries.reduce<Record<string, MealInsightContributor>>(
          (nextContributors, entry) => {
            const mealId = entry.mealEntry.mealId;
            const current =
              nextContributors[mealId] ??
              ({
                mealId,
                mealLabel: mealLabel({ mealId }),
                quantityGrams: 0,
                totals: Reporting.emptyNutrientTotals(),
              } satisfies MealInsightContributor);

            return {
              ...nextContributors,
              [mealId]: {
                ...current,
                quantityGrams:
                  current.quantityGrams + _entryMassGrams({ entry }),
                totals: Reporting.addNutrientTotals({
                  left: current.totals,
                  right: _entryTotals({ entry }),
                }),
              },
            };
          },
          contributors
        ),
      {}
    )
  );
  const dayVolumeContributors = report.days.map((day) => ({
    dateKey: day.dateKey,
    energyKcal: day.totals.energyKcal,
    quantityGrams: day.entries.reduce(
      (total, entry) => total + _entryMassGrams({ entry }),
      0
    ),
  }));
  const averageTargetTotals = insightNutrients.reduce<
    Record<Reporting.NutrientName, number | null>
  >(
    (targets, nutrientName) => {
      const targetAmounts = report.days.flatMap((day) => {
        const amount = Reporting.getPlanNutrientTargetAmount({
          nutrientName,
          plan: day.plan,
        });

        return amount === undefined ? [] : [amount];
      });

      return {
        ...targets,
        [nutrientName]:
          dayCount === 0 || targetAmounts.length !== dayCount
            ? null
            : targetAmounts.reduce((total, amount) => total + amount, 0) /
              dayCount,
      };
    },
    {
      carbsGrams: null,
      energyKcal: null,
      fatGrams: null,
      fiberGrams: null,
      proteinGrams: null,
      saltGrams: null,
      saturatedFatGrams: null,
      sugarGrams: null,
    }
  );

  return {
    averageTargetTotals,
    averageTotals,
    dayCount,
    dayVolumeContributors,
    foodContributors,
    formatDate: ({ dateKey }: { readonly dateKey: Domain.DateKey }) => {
      const [yearString, monthString, dayString] = dateKey.split("-");
      const year = Number(yearString);
      const month = Number(monthString);
      const day = Number(dayString);
      const date = new Date(Date.UTC(year, month - 1, day, 12));

      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
    },
    formatPercent: ({ share }) => `${Math.round(share * 100)}%`,
    formatWeight: ({ quantityGrams }) => `${Math.round(quantityGrams)}g`,
    mealContributors,
    mealLabel,
    report,
    totalQuantityGrams,
    totals,
    weightCoverageComplete,
  };
}

function _entryMassGrams({
  entry,
}: {
  readonly entry: NutritionReports.NutritionReportRange["days"][number]["entries"][number];
}) {
  return (
    Measurements.massGramsFromQuantity({
      food: entry.food,
      quantity: entry.mealEntry.quantity,
    }) ?? 0
  );
}

function _entryTotals({
  entry,
}: {
  readonly entry: NutritionReports.NutritionReportRange["days"][number]["entries"][number];
}): Reporting.NutrientTotals {
  return {
    carbsGrams: entry.nutrients.carbsGrams,
    energyKcal: entry.nutrients.energyKcal,
    fatGrams: entry.nutrients.fatGrams,
    fiberGrams: entry.nutrients.fiberGrams ?? 0,
    proteinGrams: entry.nutrients.proteinGrams,
    saltGrams: entry.nutrients.saltGrams ?? 0,
    saturatedFatGrams: entry.nutrients.saturatedFatGrams ?? 0,
    sugarGrams: entry.nutrients.sugarGrams ?? 0,
  };
}
