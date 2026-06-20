import {
  addNutrientTotals,
  type Meal,
  type NutrientName,
  type NutrientTotals,
} from "@mai/nutrition";
import { Array } from "effect";
import { ListChecks, Utensils } from "lucide-react";
import type { ReactNode } from "react";

import type {
  NutritionReportEntry,
  NutritionReportRange,
} from "../services/nutrition-reports.ts";
import {
  formatReportNutrient,
  NutritionInsightsLayout,
  reportNutrientLabels,
  reportNutrientToneClassNames,
  reportTrackedNutrients,
} from "./nutrition-insights.tsx";

const contributorNutrients = [
  "energyKcal",
  "proteinGrams",
  "sugarGrams",
  "saltGrams",
  "saturatedFatGrams",
] as const satisfies readonly NutrientName[];

const mealMetricNutrients = [
  "energyKcal",
  "proteinGrams",
  "fatGrams",
  "sugarGrams",
] as const satisfies readonly NutrientName[];

const mealLabels = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
} satisfies Record<Meal, string>;

export function RangeSummary({
  report,
}: {
  readonly report: NutritionReportRange;
}) {
  const dayCount = report.days.length;
  const loggedDays = report.days.filter((day) =>
    Array.isReadonlyArrayNonEmpty(day.mealEntries)
  );
  const alignedDays = report.days.filter(
    (day) => day.isInsideExpectedPlanRange
  );
  const entries = report.days.flatMap((day) => day.entries);
  const recurringMisses = reportTrackedNutrients
    .flatMap((nutrientName) => {
      const statuses = report.days.flatMap((day) =>
        day.targetStatuses.filter(
          (status) =>
            status.nutrientName === nutrientName && status.status !== "inside"
        )
      );
      const belowCount = statuses.filter(
        (status) => status.status === "below"
      ).length;
      const aboveCount = statuses.filter(
        (status) => status.status === "above"
      ).length;

      return [
        ...(belowCount === 0
          ? []
          : [
              {
                count: belowCount,
                label: "Low",
                nutrientName,
                status: "below",
              },
            ]),
        ...(aboveCount === 0
          ? []
          : [
              {
                count: aboveCount,
                label: "High",
                nutrientName,
                status: "above",
              },
            ]),
      ];
    })
    .sort((left, right) => right.count - left.count);
  const emptyMealContributors = {
    breakfast: {
      entriesCount: 0,
      meal: "breakfast",
      totals: _emptyNutrientTotals(),
    },
    dinner: {
      entriesCount: 0,
      meal: "dinner",
      totals: _emptyNutrientTotals(),
    },
    lunch: {
      entriesCount: 0,
      meal: "lunch",
      totals: _emptyNutrientTotals(),
    },
  } satisfies Record<Meal, MealContributor>;
  const mealContributors = Object.values(
    entries.reduce<Record<Meal, MealContributor>>((contributors, entry) => {
      const current = contributors[entry.mealEntry.meal];

      return {
        ...contributors,
        [entry.mealEntry.meal]: {
          entriesCount: current.entriesCount + 1,
          meal: current.meal,
          totals: addNutrientTotals({
            left: current.totals,
            right: _entryNutrientTotals({ entry }),
          }),
        },
      };
    }, emptyMealContributors)
  ).sort((left, right) => right.totals.energyKcal - left.totals.energyKcal);
  const foodContributors = Object.values(
    entries.reduce<Record<string, FoodContributor>>((contributors, entry) => {
      const current =
        contributors[entry.food.id] ??
        ({
          brand: entry.food.brand,
          foodId: entry.food.id,
          name: entry.food.name,
          totals: _emptyNutrientTotals(),
        } satisfies FoodContributor);

      return {
        ...contributors,
        [entry.food.id]: {
          ...current,
          totals: addNutrientTotals({
            left: current.totals,
            right: _entryNutrientTotals({ entry }),
          }),
        },
      };
    }, {})
  ).sort((left, right) => right.totals.energyKcal - left.totals.energyKcal);
  const topMiss = recurringMisses[0];
  const topMeal = mealContributors[0];
  const summaryLines = [
    `${alignedDays.length}/${dayCount} days aligned with plan targets.`,
    `${loggedDays.length}/${dayCount} days had logged meals.`,
    topMiss === undefined
      ? "No recurring target miss in this range."
      : `${reportNutrientLabels[topMiss.nutrientName]} ${topMiss.label.toLowerCase()} ${topMiss.count}/${dayCount} days.`,
    topMeal === undefined
      ? "No meal contributors yet."
      : `${mealLabels[topMeal.meal]} contributed most calories.`,
  ];

  return (
    <NutritionInsightsLayout activeRoute="range" title="Nutrition insights">
      <section className="grid gap-4">
        <SectionHeading
          icon={<ListChecks size={17} strokeWidth={3} />}
          title="Summary"
        />
        <div className="grid gap-2.5">
          {summaryLines.map((line) => (
            <p
              className="rounded-md border border-[#2d2d31] bg-[#161618] px-3 py-2 text-sm font-black leading-tight text-[#dedee3]"
              key={line}
            >
              {line}
            </p>
          ))}
        </div>
      </section>

      <section className="grid gap-4 border-t border-[#27272b] pt-7">
        <SectionHeading
          icon={<ListChecks size={17} strokeWidth={3} />}
          title="Recurring misses"
        />
        {!Array.isReadonlyArrayNonEmpty(recurringMisses) ? (
          <p className="rounded-md border border-[#1f5f38] bg-[#102417] px-3 py-2 text-sm font-black text-[#74d99f]">
            Targets stayed in range.
          </p>
        ) : (
          <div className="grid gap-2.5">
            {recurringMisses.slice(0, 6).map((miss) => (
              <article
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-[#2d2d31] bg-[#161618] px-3 py-2"
                key={`${miss.nutrientName}-${miss.status}`}
              >
                <div className="min-w-0">
                  <h3
                    className={`truncate text-sm font-black leading-tight ${reportNutrientToneClassNames[miss.nutrientName]}`}
                  >
                    {reportNutrientLabels[miss.nutrientName]}
                  </h3>
                  <p className="truncate text-xs font-bold leading-tight text-[#aaaab1]">
                    {miss.label}
                  </p>
                </div>
                <span className="text-sm font-black text-[#dedee3]">
                  {miss.count}/{dayCount}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 border-t border-[#27272b] pt-7">
        <SectionHeading
          icon={<Utensils size={17} strokeWidth={3} />}
          title="Meals"
        />
        <div className="grid gap-2.5">
          {mealContributors.map((meal) => (
            <article
              className="grid gap-2 rounded-md border border-[#2d2d31] bg-[#161618] p-3"
              key={meal.meal}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <h3 className="truncate text-sm font-black leading-tight text-[#f5f5f7]">
                  {mealLabels[meal.meal]}
                </h3>
                <span className="text-xs font-black text-[#aaaab1]">
                  {meal.entriesCount} entries
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {mealMetricNutrients.map((nutrientName) => (
                  <MiniMetric
                    key={nutrientName}
                    nutrientName={nutrientName}
                    value={meal.totals[nutrientName]}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 border-t border-[#27272b] pt-7">
        <SectionHeading
          icon={<Utensils size={17} strokeWidth={3} />}
          title="Foods"
        />
        <div className="grid gap-4">
          {contributorNutrients.map((nutrientName) => {
            const foods = foodContributors
              .filter((food) => food.totals[nutrientName] > 0)
              .sort(
                (left, right) =>
                  right.totals[nutrientName] - left.totals[nutrientName]
              )
              .slice(0, 3);

            return (
              <article className="grid gap-2.5" key={nutrientName}>
                <h3
                  className={`text-sm font-black leading-tight ${reportNutrientToneClassNames[nutrientName]}`}
                >
                  {reportNutrientLabels[nutrientName]}
                </h3>
                {!Array.isReadonlyArrayNonEmpty(foods) ? (
                  <p className="rounded-md border border-[#2d2d31] bg-[#161618] px-3 py-2 text-sm font-bold text-[#aaaab1]">
                    No tracked foods.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {foods.map((food) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-[#2d2d31] bg-[#161618] px-3 py-2"
                        key={`${nutrientName}-${food.foodId}`}
                      >
                        <span className="truncate text-sm font-black text-[#dedee3]">
                          {food.name}
                        </span>
                        <span className="text-sm font-black text-[#aaaab1]">
                          {formatReportNutrient({
                            nutrientName,
                            value: food.totals[nutrientName],
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </NutritionInsightsLayout>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  readonly icon: ReactNode;
  readonly title: string;
}) {
  return (
    <h2 className="inline-flex items-center gap-2 text-base font-black leading-tight text-[#f5f5f7]">
      <span className="text-[#ff5a51]">{icon}</span>
      {title}
    </h2>
  );
}

function MiniMetric({
  nutrientName,
  value,
}: {
  readonly nutrientName: NutrientName;
  readonly value: number;
}) {
  return (
    <div className="min-w-0">
      <p
        className={`truncate text-[0.68rem] font-bold leading-tight ${reportNutrientToneClassNames[nutrientName]}`}
      >
        {reportNutrientLabels[nutrientName]}
      </p>
      <p className="truncate text-sm font-black leading-tight text-[#dedee3]">
        {formatReportNutrient({ nutrientName, value })}
      </p>
    </div>
  );
}

type MealContributor = {
  readonly entriesCount: number;
  readonly meal: Meal;
  readonly totals: NutrientTotals;
};

type FoodContributor = {
  readonly brand: string | undefined;
  readonly foodId: string;
  readonly name: string;
  readonly totals: NutrientTotals;
};

function _entryNutrientTotals({
  entry,
}: {
  readonly entry: NutritionReportEntry;
}): NutrientTotals {
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

function _emptyNutrientTotals(): NutrientTotals {
  return {
    carbsGrams: 0,
    energyKcal: 0,
    fatGrams: 0,
    fiberGrams: 0,
    proteinGrams: 0,
    saltGrams: 0,
    saturatedFatGrams: 0,
    sugarGrams: 0,
  };
}
