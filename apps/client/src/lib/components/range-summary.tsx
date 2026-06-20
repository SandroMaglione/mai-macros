import { addNutrientTotals, type NutrientTotals } from "@mai/nutrition";
import { Array } from "effect";
import { ListChecks, Utensils } from "lucide-react";
import type { ReactNode } from "react";

import type { NutritionReportRange } from "../services/nutrition-reports.ts";
import {
  formatReportNutrient,
  NutritionInsightsLayout,
  reportNutrientLabels,
  reportNutrientToneClassNames,
  reportTrackedNutrients,
} from "./nutrition-insights.tsx";

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
  const foodContributors = Object.values(
    entries.reduce<Record<string, FoodContributor>>((contributors, entry) => {
      const current =
        contributors[entry.food.id] ??
        ({
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
            right: {
              carbsGrams: entry.nutrients.carbsGrams,
              energyKcal: entry.nutrients.energyKcal,
              fatGrams: entry.nutrients.fatGrams,
              fiberGrams: entry.nutrients.fiberGrams ?? 0,
              proteinGrams: entry.nutrients.proteinGrams,
              saltGrams: entry.nutrients.saltGrams ?? 0,
              saturatedFatGrams: entry.nutrients.saturatedFatGrams ?? 0,
              sugarGrams: entry.nutrients.sugarGrams ?? 0,
            },
          }),
        },
      };
    }, {})
  ).sort((left, right) => right.totals.energyKcal - left.totals.energyKcal);
  const summaryLines = [
    `${alignedDays.length}/${dayCount} days aligned with plan targets.`,
    `${loggedDays.length}/${dayCount} days had logged meals.`,
    `${report.activePlan.name} was active for this range.`,
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
          icon={<Utensils size={17} strokeWidth={3} />}
          title="Foods"
        />
        <div className="grid gap-4">
          {reportTrackedNutrients.map((nutrientName) => {
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

type FoodContributor = {
  readonly foodId: string;
  readonly name: string;
  readonly totals: NutrientTotals;
};

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
