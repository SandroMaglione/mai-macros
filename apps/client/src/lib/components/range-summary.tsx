import { NutritionReports, Reporting } from "@mai/nutrition";
import { Array } from "effect";

import { getNutritionReportInsights } from "../nutrition-report-insights.ts";
import {
  formatReportNutrient,
  formatReportSignedNumber,
  NutritionInsightsLayout,
  reportNutrientLabels,
  reportNutrientToneClassNames,
  reportTrackedNutrients,
} from "./nutrition-insights.tsx";

export function RangeSummary({
  report,
}: {
  readonly report: NutritionReports.NutritionReportRange;
}) {
  const dayCount = report.days.length;
  const entries = report.days.flatMap((day) => day.entries);
  const foodContributors = Object.values(
    entries.reduce<Record<string, FoodContributor>>((contributors, entry) => {
      const current =
        contributors[entry.food.id] ??
        ({
          foodId: entry.food.id,
          name: entry.food.name,
          totals: Reporting.emptyNutrientTotals(),
        } satisfies FoodContributor);

      return {
        ...contributors,
        [entry.food.id]: {
          ...current,
          totals: Reporting.addNutrientTotals({
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
  const totals = report.days.reduce<Reporting.NutrientTotals>(
    (currentTotals, day) =>
      Reporting.addNutrientTotals({
        left: currentTotals,
        right: day.totals,
      }),
    Reporting.emptyNutrientTotals()
  );
  const averageTotals = Reporting.divideNutrientTotals({
    divisor: dayCount,
    totals,
  });
  const averageTargetTotals = {
    carbsGrams: _getAverageTargetAmount({
      nutrientName: "carbsGrams",
      report,
    }),
    energyKcal: _getAverageTargetAmount({
      nutrientName: "energyKcal",
      report,
    }),
    fatGrams: _getAverageTargetAmount({ nutrientName: "fatGrams", report }),
    fiberGrams: _getAverageTargetAmount({
      nutrientName: "fiberGrams",
      report,
    }),
    proteinGrams: _getAverageTargetAmount({
      nutrientName: "proteinGrams",
      report,
    }),
    saltGrams: _getAverageTargetAmount({ nutrientName: "saltGrams", report }),
    saturatedFatGrams: _getAverageTargetAmount({
      nutrientName: "saturatedFatGrams",
      report,
    }),
    sugarGrams: _getAverageTargetAmount({
      nutrientName: "sugarGrams",
      report,
    }),
  } satisfies Record<Reporting.NutrientName, number | null>;
  const summaryInsights = getNutritionReportInsights({
    limit: 6,
    report,
  });

  return (
    <NutritionInsightsLayout title="Nutrition insights">
      <section className="grid gap-4">
        <SectionTitle
          description="Patterns that are easy to miss day to day, ranked from food-specific signals to broader habits."
          title="Summary"
        />
        <div className="divide-y divide-[#29292d]">
          {!Array.isReadonlyArrayNonEmpty(summaryInsights) ? (
            <p className="py-2 text-sm leading-tight text-[#dedee3]">
              Log more meals to surface weekly food and meal patterns.
            </p>
          ) : (
            summaryInsights.map((insight) => (
              <p
                className="py-2 text-sm leading-tight text-[#dedee3]"
                key={insight.id}
              >
                {insight.parts.map((part, index) => (
                  <span
                    className={
                      part.tone === "food"
                        ? "rounded bg-[#ffbd35]/15 px-1 text-[#ffcf75] ring-1 ring-[#ffbd35]/20"
                        : undefined
                    }
                    key={`${insight.id}-${index}`}
                  >
                    {part.text}
                  </span>
                ))}
              </p>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 border-t border-[#27272b] pt-7">
        <SectionTitle
          description="Average daily intake across recorded days in the last 7 days, compared with daily targets when available."
          title="Recorded-day average"
        />
        <div className="grid grid-cols-2 gap-2.5">
          {reportTrackedNutrients.map((nutrientName) => (
            <NutrientBalanceTile
              actual={averageTotals[nutrientName]}
              key={nutrientName}
              nutrientName={nutrientName}
              target={averageTargetTotals[nutrientName]}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 border-t border-[#27272b] pt-7">
        <SectionTitle
          description="Top foods contributing to each nutrient across recorded days in this range."
          title="Foods"
        />
        <div className="grid gap-5">
          {reportTrackedNutrients.map((nutrientName) => {
            const foods = foodContributors
              .filter((food) => food.totals[nutrientName] > 0)
              .sort(
                (left, right) =>
                  right.totals[nutrientName] - left.totals[nutrientName]
              )
              .slice(0, 3);

            return (
              <article className="grid gap-1.5" key={nutrientName}>
                <h3
                  className={`text-sm font-black leading-tight ${reportNutrientToneClassNames[nutrientName]}`}
                >
                  {reportNutrientLabels[nutrientName]}
                </h3>
                {!Array.isReadonlyArrayNonEmpty(foods) ? (
                  <p className="py-1.5 text-sm leading-tight text-[#aaaab1]">
                    No tracked foods.
                  </p>
                ) : (
                  <div className="divide-y divide-[#29292d]">
                    {foods.map((food) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-1.5"
                        key={`${nutrientName}-${food.foodId}`}
                      >
                        <span className="min-w-0 truncate text-sm leading-tight text-[#dedee3]">
                          {food.name}
                        </span>
                        <span className="text-right text-sm leading-tight text-[#aaaab1]">
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

function _getAverageTargetAmount({
  nutrientName,
  report,
}: {
  readonly nutrientName: Reporting.NutrientName;
  readonly report: NutritionReports.NutritionReportRange;
}) {
  const dayCount = report.days.length;
  const targetAmounts = report.days.flatMap((day) => {
    const amount = Reporting.getPlanNutrientTargetAmount({
      nutrientName,
      plan: day.plan,
    });

    return amount === undefined ? [] : [amount];
  });

  if (dayCount === 0 || targetAmounts.length !== dayCount) {
    return null;
  }

  return targetAmounts.reduce((total, amount) => total + amount, 0) / dayCount;
}

function SectionTitle({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <header className="grid gap-1">
      <h2 className="text-base font-black leading-tight text-[#f5f5f7]">
        {title}
      </h2>
      <p className="max-w-xl text-sm leading-snug text-[#8f8f98]">
        {description}
      </p>
    </header>
  );
}

function NutrientBalanceTile({
  actual,
  nutrientName,
  target,
}: {
  readonly actual: number;
  readonly nutrientName: Reporting.NutrientName;
  readonly target: number | null;
}) {
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";

  return (
    <article className="grid gap-2 rounded-md border border-[#2d2d31] bg-[#161618] p-3">
      <h3
        className={`truncate text-sm font-black leading-tight ${reportNutrientToneClassNames[nutrientName]}`}
      >
        {reportNutrientLabels[nutrientName]}
      </h3>
      <p className="text-2xl font-black leading-none text-[#f5f5f7]">
        {formatReportNutrient({ nutrientName, value: actual })}
      </p>
      <p className="text-xs font-black leading-tight text-[#aaaab1]">
        {target === null
          ? "No target"
          : formatReportSignedNumber({
              unit,
              value: actual - target,
            })}
      </p>
    </article>
  );
}

type FoodContributor = {
  readonly foodId: string;
  readonly name: string;
  readonly totals: Reporting.NutrientTotals;
};
