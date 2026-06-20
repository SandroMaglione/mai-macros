import {
  addNutrientTotals,
  divideNutrientTotals,
  getPlanNutrientTargetAmount,
  type NutrientName,
  type NutrientTotals,
} from "@mai/nutrition";
import { Array } from "effect";

import type { NutritionReportRange } from "../services/nutrition-reports.ts";
import {
  formatReportNutrient,
  formatReportNumber,
  formatReportSignedNumber,
  NutritionInsightsLayout,
  reportNutrientLabels,
  reportNutrientToneClassNames,
  reportPrimaryNutrients,
  TargetStatusPill,
} from "./nutrition-insights.tsx";

export function RollingPlanBalance({
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
  const totals = report.days.reduce<NutrientTotals>(
    (currentTotals, day) =>
      addNutrientTotals({
        left: currentTotals,
        right: day.totals,
      }),
    {
      carbsGrams: 0,
      energyKcal: 0,
      fatGrams: 0,
      fiberGrams: 0,
      proteinGrams: 0,
      saltGrams: 0,
      saturatedFatGrams: 0,
      sugarGrams: 0,
    }
  );
  const averageTotals = divideNutrientTotals({
    divisor: dayCount,
    totals,
  });
  const targetTotals = report.days.reduce<NutrientTotals>(
    (currentTotals, day) =>
      addNutrientTotals({
        left: currentTotals,
        right: {
          carbsGrams:
            getPlanNutrientTargetAmount({
              nutrientName: "carbsGrams",
              plan: day.plan,
            }) ?? 0,
          energyKcal:
            getPlanNutrientTargetAmount({
              nutrientName: "energyKcal",
              plan: day.plan,
            }) ?? 0,
          fatGrams:
            getPlanNutrientTargetAmount({
              nutrientName: "fatGrams",
              plan: day.plan,
            }) ?? 0,
          fiberGrams:
            getPlanNutrientTargetAmount({
              nutrientName: "fiberGrams",
              plan: day.plan,
            }) ?? 0,
          proteinGrams:
            getPlanNutrientTargetAmount({
              nutrientName: "proteinGrams",
              plan: day.plan,
            }) ?? 0,
          saltGrams:
            getPlanNutrientTargetAmount({
              nutrientName: "saltGrams",
              plan: day.plan,
            }) ?? 0,
          saturatedFatGrams:
            getPlanNutrientTargetAmount({
              nutrientName: "saturatedFatGrams",
              plan: day.plan,
            }) ?? 0,
          sugarGrams:
            getPlanNutrientTargetAmount({
              nutrientName: "sugarGrams",
              plan: day.plan,
            }) ?? 0,
        },
      }),
    {
      carbsGrams: 0,
      energyKcal: 0,
      fatGrams: 0,
      fiberGrams: 0,
      proteinGrams: 0,
      saltGrams: 0,
      saturatedFatGrams: 0,
      sugarGrams: 0,
    }
  );
  const averageTargetTotals = divideNutrientTotals({
    divisor: dayCount,
    totals: targetTotals,
  });
  const recurringMisses = reportPrimaryNutrients
    .map((nutrientName) => ({
      misses: report.days.filter((day) =>
        day.targetStatuses.some(
          (status) =>
            status.nutrientName === nutrientName && status.status !== "inside"
        )
      ).length,
      nutrientName,
    }))
    .filter((summary) => summary.misses > 0)
    .sort((left, right) => right.misses - left.misses);

  return (
    <NutritionInsightsLayout activeRoute="week" title="7-day balance">
      <section className="grid gap-4 border-b border-[#27272b] pb-6">
        <div className="grid grid-cols-3 gap-2.5">
          <SummaryTile
            label="Aligned"
            value={`${alignedDays.length}/${dayCount}`}
          />
          <SummaryTile
            label="Logged"
            value={`${loggedDays.length}/${dayCount}`}
          />
          <SummaryTile label="Plan" value={report.activePlan.name} />
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle title="Average per day" />
        <div className="grid grid-cols-2 gap-2.5">
          {reportPrimaryNutrients.map((nutrientName) => (
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
        <SectionTitle title="Weekly totals" />
        <div className="grid gap-2.5">
          {reportPrimaryNutrients.map((nutrientName) => (
            <WeeklyTotalRow
              actual={totals[nutrientName]}
              key={nutrientName}
              nutrientName={nutrientName}
              target={targetTotals[nutrientName]}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 border-t border-[#27272b] pt-7">
        <SectionTitle title="Daily status" />
        <div className="grid gap-2.5">
          {report.days.map((day) => (
            <article
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-[#2d2d31] bg-[#161618] p-3"
              key={day.dateKey}
            >
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black leading-tight text-[#f5f5f7]">
                  {day.dateKey}
                </h2>
                <p className="truncate text-xs font-bold leading-tight text-[#aaaab1]">
                  {day.mealEntries.length} entries · {day.plan.name}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {day.targetStatuses
                  .filter((status) =>
                    reportPrimaryNutrients.some(
                      (nutrientName) => nutrientName === status.nutrientName
                    )
                  )
                  .map((status) => (
                    <TargetStatusPill
                      key={status.nutrientName}
                      status={status}
                    />
                  ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 border-t border-[#27272b] pt-7">
        <SectionTitle title="Recurring misses" />
        {!Array.isReadonlyArrayNonEmpty(recurringMisses) ? (
          <p className="rounded-md border border-[#1f5f38] bg-[#102417] px-3 py-2 text-sm font-black text-[#74d99f]">
            Core targets held all week.
          </p>
        ) : (
          <div className="grid gap-2.5">
            {recurringMisses.map((summary) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-[#2d2d31] bg-[#161618] px-3 py-2"
                key={summary.nutrientName}
              >
                <span
                  className={`truncate text-sm font-black ${reportNutrientToneClassNames[summary.nutrientName]}`}
                >
                  {reportNutrientLabels[summary.nutrientName]}
                </span>
                <span className="text-sm font-black text-[#dedee3]">
                  {summary.misses}/{dayCount} days
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </NutritionInsightsLayout>
  );
}

function SectionTitle({ title }: { readonly title: string }) {
  return (
    <h2 className="text-base font-black leading-tight text-[#f5f5f7]">
      {title}
    </h2>
  );
}

function SummaryTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border border-[#2d2d31] bg-[#161618] px-3 py-3 text-center">
      <dt className="truncate text-xs font-bold uppercase leading-tight tracking-normal text-[#aaaab1]">
        {label}
      </dt>
      <dd className="truncate text-xl font-black leading-tight text-[#f5f5f7]">
        {value}
      </dd>
    </div>
  );
}

function NutrientBalanceTile({
  actual,
  nutrientName,
  target,
}: {
  readonly actual: number;
  readonly nutrientName: NutrientName;
  readonly target: number;
}) {
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";

  return (
    <article className="grid gap-2 rounded-md border border-[#2d2d31] bg-[#161618] p-3">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h3
          className={`truncate text-sm font-black leading-tight ${reportNutrientToneClassNames[nutrientName]}`}
        >
          {reportNutrientLabels[nutrientName]}
        </h3>
        <span className="text-xs font-black text-[#aaaab1]">
          {formatReportSignedNumber({
            unit,
            value: actual - target,
          })}
        </span>
      </div>
      <p className="text-2xl font-black leading-none text-[#f5f5f7]">
        {formatReportNutrient({ nutrientName, value: actual })}
      </p>
      <p className="text-xs font-bold leading-tight text-[#aaaab1]">
        Target {formatReportNutrient({ nutrientName, value: target })}
      </p>
    </article>
  );
}

function WeeklyTotalRow({
  actual,
  nutrientName,
  target,
}: {
  readonly actual: number;
  readonly nutrientName: NutrientName;
  readonly target: number;
}) {
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md border border-[#2d2d31] bg-[#161618] px-3 py-2">
      <span
        className={`truncate text-sm font-black ${reportNutrientToneClassNames[nutrientName]}`}
      >
        {reportNutrientLabels[nutrientName]}
      </span>
      <span className="text-sm font-black text-[#dedee3]">
        {formatReportNumber({ value: actual })}
        {unit === "g" ? "g" : ""}
      </span>
      <span className="text-right text-sm font-black text-[#aaaab1]">
        {formatReportSignedNumber({ unit, value: actual - target })}
      </span>
    </div>
  );
}
