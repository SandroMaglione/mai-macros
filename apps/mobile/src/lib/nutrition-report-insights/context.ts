import type * as Domain from "@mai/nutrition/domain";
import * as Measurements from "@mai/nutrition/measurements";
import * as Reporting from "@mai/nutrition/reporting";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";

import { insightNutrients } from "./constants.ts";
import type {
  FoodInsightContributor,
  InsightContext,
  MealInsightContributor,
} from "./types.ts";

const insightDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function buildInsightContext({
  report,
}: {
  readonly report: NutritionReports.NutritionReportRange;
}): InsightContext {
  const countedDays = NutritionReports.countedNutritionDays({ report });
  const dayCount = countedDays.length;
  const totals: MutableNutrientTotals = {
    carbsGrams: 0,
    energyKcal: 0,
    fatGrams: 0,
    fiberGrams: 0,
    proteinGrams: 0,
    saltGrams: 0,
    saturatedFatGrams: 0,
    sugarGrams: 0,
  };
  const mealLabelsById: Record<string, string> = {};
  const foodContributorsById: Record<string, MutableFoodInsightContributor> =
    {};
  const mealContributorsById: Record<string, MutableMealInsightContributor> =
    {};
  const dayVolumeContributors: InsightContext["dayVolumeContributors"][number][] =
    [];
  let totalQuantityGrams = 0;
  let weightCoverageComplete = countedDays.every((day) =>
    day.entries.every(
      (entry) =>
        entry.food !== null &&
        entry.mealEntry.kind === "catalog" &&
        entry.mealEntry.quantityAccuracy !== "estimated"
    )
  );

  for (const day of countedDays) {
    _addNutrientTotalsInPlace({ target: totals, value: day.totals });

    for (const meal of day.plan.meals) {
      mealLabelsById[meal.id] = meal.name;
    }

    let dayQuantityGrams = 0;

    for (const entry of day.entries.filter(
      NutritionReports.isCatalogReportEntry
    )) {
      const quantityGrams = Measurements.massGramsFromQuantity({
        food: entry.food,
        quantity: entry.mealEntry.quantity,
      });
      const resolvedQuantityGrams = quantityGrams ?? 0;
      const entryTotals: Reporting.NutrientTotals = {
        carbsGrams: entry.nutrients.carbsGrams,
        energyKcal: entry.nutrients.energyKcal,
        fatGrams: entry.nutrients.fatGrams,
        fiberGrams: entry.nutrients.fiberGrams ?? 0,
        proteinGrams: entry.nutrients.proteinGrams,
        saltGrams: entry.nutrients.saltGrams ?? 0,
        saturatedFatGrams: entry.nutrients.saturatedFatGrams ?? 0,
        sugarGrams: entry.nutrients.sugarGrams ?? 0,
      };
      const mealId = entry.mealEntry.mealId;
      weightCoverageComplete &&= quantityGrams !== undefined;
      dayQuantityGrams += resolvedQuantityGrams;

      const foodContributor =
        foodContributorsById[entry.food.id] ??
        ({
          daysByDateKey: {},
          foodId: entry.food.id,
          mealsByName: {},
          name: entry.food.name,
          quantityGrams: 0,
          totals: {
            carbsGrams: 0,
            energyKcal: 0,
            fatGrams: 0,
            fiberGrams: 0,
            proteinGrams: 0,
            saltGrams: 0,
            saturatedFatGrams: 0,
            sugarGrams: 0,
          },
        } satisfies MutableFoodInsightContributor);
      foodContributorsById[entry.food.id] = foodContributor;
      foodContributor.daysByDateKey[day.dateKey] = true;
      const mealDays = foodContributor.mealsByName[mealId] ?? {};
      foodContributor.mealsByName[mealId] = mealDays;
      mealDays[day.dateKey] = true;
      foodContributor.quantityGrams += resolvedQuantityGrams;
      _addNutrientTotalsInPlace({
        target: foodContributor.totals,
        value: entryTotals,
      });

      const mealContributor =
        mealContributorsById[mealId] ??
        ({
          mealId,
          mealLabel: "Meal",
          quantityGrams: 0,
          totals: {
            carbsGrams: 0,
            energyKcal: 0,
            fatGrams: 0,
            fiberGrams: 0,
            proteinGrams: 0,
            saltGrams: 0,
            saturatedFatGrams: 0,
            sugarGrams: 0,
          },
        } satisfies MutableMealInsightContributor);
      mealContributorsById[mealId] = mealContributor;
      mealContributor.quantityGrams += resolvedQuantityGrams;
      _addNutrientTotalsInPlace({
        target: mealContributor.totals,
        value: entryTotals,
      });
    }

    totalQuantityGrams += dayQuantityGrams;
    dayVolumeContributors.push({
      dateKey: day.dateKey,
      energyKcal: day.totals.energyKcal,
      quantityGrams: dayQuantityGrams,
    });
  }

  for (const contributor of Object.values(mealContributorsById)) {
    contributor.mealLabel = mealLabelsById[contributor.mealId] ?? "Meal";
  }

  const averageTotals =
    dayCount === 0
      ? Reporting.emptyNutrientTotals()
      : Reporting.divideNutrientTotals({
          divisor: dayCount,
          totals,
        });
  const mealLabel = ({ mealId }: { readonly mealId: string }) =>
    mealLabelsById[mealId] ?? "Meal";
  const averageTargetTotals = insightNutrients.reduce<
    Record<Reporting.NutrientName, number | null>
  >(
    (targets, nutrientName) => {
      const targetAmounts = countedDays.flatMap((day) => {
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
    foodContributors: Object.values(foodContributorsById),
    formatDate: ({ dateKey }: { readonly dateKey: Domain.DateKey }) => {
      const [yearString, monthString, dayString] = dateKey.split("-");
      const year = Number(yearString);
      const month = Number(monthString);
      const day = Number(dayString);
      const date = new Date(Date.UTC(year, month - 1, day, 12));

      return insightDateFormatter.format(date);
    },
    formatPercent: ({ share }) => `${Math.round(share * 100)}%`,
    formatWeight: ({ quantityGrams }) => `${Math.round(quantityGrams)}g`,
    mealContributors: Object.values(mealContributorsById),
    mealLabel,
    report,
    totalQuantityGrams,
    totals,
    weightCoverageComplete,
  };
}

type MutableNutrientTotals = {
  -readonly [Key in keyof Reporting.NutrientTotals]: Reporting.NutrientTotals[Key];
};

type MutableFoodInsightContributor = Omit<
  FoodInsightContributor,
  "quantityGrams" | "totals"
> & {
  quantityGrams: number;
  totals: MutableNutrientTotals;
};

type MutableMealInsightContributor = Omit<
  MealInsightContributor,
  "mealLabel" | "quantityGrams" | "totals"
> & {
  mealLabel: string;
  quantityGrams: number;
  totals: MutableNutrientTotals;
};

function _addNutrientTotalsInPlace({
  target,
  value,
}: {
  readonly target: MutableNutrientTotals;
  readonly value: Reporting.NutrientTotals;
}) {
  target.carbsGrams += value.carbsGrams;
  target.energyKcal += value.energyKcal;
  target.fatGrams += value.fatGrams;
  target.fiberGrams += value.fiberGrams;
  target.proteinGrams += value.proteinGrams;
  target.saltGrams += value.saltGrams;
  target.saturatedFatGrams += value.saturatedFatGrams;
  target.sugarGrams += value.sugarGrams;
}
