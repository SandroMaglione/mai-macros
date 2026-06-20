import type { NutrientName, NutrientTargetStatus } from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { Array } from "effect";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { NutritionReportRange } from "../services/nutrition-reports.ts";
import {
  NutritionInsightsLayout,
  reportNutrientDotClassNames,
  reportNutrientLabels,
  reportPrimaryNutrients,
  reportSecondaryNutrients,
  targetStatusText,
} from "./nutrition-insights.tsx";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MacroCalendar({
  monthKey,
  nextMonthKey,
  previousMonthKey,
  report,
}: {
  readonly monthKey: string;
  readonly nextMonthKey: string;
  readonly previousMonthKey: string;
  readonly report: NutritionReportRange;
}) {
  const monthDate = new Date(`${monthKey}-01T00:00:00`);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthDate);
  const leadingBlankDays = (monthDate.getDay() + 6) % 7;
  const leadingBlankDayIndexes: number[] = [];
  const visibleNutrients = [
    ...reportPrimaryNutrients,
    ...reportSecondaryNutrients.filter((nutrientName) =>
      report.days.some((day) =>
        day.targetStatuses.some(
          (status) => status.nutrientName === nutrientName
        )
      )
    ),
  ];

  for (let index = 0; index < leadingBlankDays; index += 1) {
    leadingBlankDayIndexes.push(index);
  }

  return (
    <NutritionInsightsLayout activeRoute="calendar" title="Macro calendar">
      <section className="grid gap-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[#2d2d31] bg-[#161618] p-2">
          <Link
            aria-label="Previous month"
            className="inline-flex size-9 items-center justify-center rounded-md border border-[#343438] bg-[#1c1c20] text-[#dedee3] no-underline transition-colors hover:bg-[#25252a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45"
            search={{ month: previousMonthKey }}
            to="/insights/calendar"
          >
            <ChevronLeft aria-hidden="true" size={18} strokeWidth={3} />
          </Link>
          <h2 className="truncate text-center text-base font-black leading-tight text-[#f5f5f7]">
            {monthLabel}
          </h2>
          <Link
            aria-label="Next month"
            className="inline-flex size-9 items-center justify-center rounded-md border border-[#343438] bg-[#1c1c20] text-[#dedee3] no-underline transition-colors hover:bg-[#25252a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45"
            search={{ month: nextMonthKey }}
            to="/insights/calendar"
          >
            <ChevronRight aria-hidden="true" size={18} strokeWidth={3} />
          </Link>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
          {visibleNutrients.map((nutrientName) => (
            <span
              className="inline-flex min-w-0 items-center gap-1.5 text-[0.68rem] font-black leading-tight text-[#aaaab1]"
              key={nutrientName}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${reportNutrientDotClassNames[nutrientName]}`}
              />
              {reportNutrientLabels[nutrientName]}
            </span>
          ))}
        </div>

        <div aria-hidden="true" className="h-px bg-[#27272b]" />

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdayLabels.map((weekdayLabel) => (
            <span
              className="truncate text-[0.68rem] font-black uppercase leading-tight tracking-normal text-[#77777e]"
              key={weekdayLabel}
            >
              {weekdayLabel}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {leadingBlankDayIndexes.map((index) => (
            <div aria-hidden="true" key={`blank-${index}`} />
          ))}
          {report.days.map((day) => (
            <DayCell
              day={day}
              key={day.dateKey}
              visibleNutrients={visibleNutrients}
            />
          ))}
        </div>
      </section>
    </NutritionInsightsLayout>
  );
}

function DayCell({
  day,
  visibleNutrients,
}: {
  readonly day: NutritionReportRange["days"][number];
  readonly visibleNutrients: readonly NutrientName[];
}) {
  const hasLoggedEntries = Array.isReadonlyArrayNonEmpty(day.mealEntries);
  const dayNumber = Number(day.dateKey.slice(8, 10));

  return (
    <article
      aria-label={`${day.dateKey}, ${
        hasLoggedEntries ? `${day.mealEntries.length} entries` : "no entries"
      }`}
      className={`grid aspect-[0.78] min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5 rounded-md border p-1.5 ${
        hasLoggedEntries
          ? "border-[#2d2d31] bg-[#161618]"
          : "border-[#202024] bg-[#111113]"
      }`}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
        <h3
          className={`min-w-0 truncate text-xs font-black leading-none ${
            hasLoggedEntries ? "text-[#f5f5f7]" : "text-[#77777e]"
          }`}
        >
          {dayNumber}
        </h3>
        <span
          className={`mt-0.5 size-1.5 justify-self-end rounded-full ${
            day.isInsideExpectedPlanRange
              ? "bg-[#74d99f]"
              : hasLoggedEntries
                ? "bg-[#ff5a51]"
                : "bg-[#3a3a3f]"
          }`}
        />
      </div>
      <div className="grid min-w-0 place-items-center">
        <div className="grid w-full max-w-10 grid-cols-2 place-items-center gap-1">
          {visibleNutrients.map((nutrientName) => (
            <NutrientStatusDot
              hasLoggedEntries={hasLoggedEntries}
              key={nutrientName}
              nutrientName={nutrientName}
              status={
                day.targetStatuses.find(
                  (status) => status.nutrientName === nutrientName
                ) ?? null
              }
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function NutrientStatusDot({
  hasLoggedEntries,
  nutrientName,
  status,
}: {
  readonly hasLoggedEntries: boolean;
  readonly nutrientName: NutrientName;
  readonly status: NutrientTargetStatus | null;
}) {
  const title =
    status === null
      ? `${reportNutrientLabels[nutrientName]} not targeted`
      : `${reportNutrientLabels[nutrientName]} ${targetStatusText({
          status,
        })}`;
  const statusClassName =
    !hasLoggedEntries || status === null
      ? "opacity-20"
      : status.status === "inside"
        ? "opacity-100"
        : status.status === "above"
          ? "opacity-100 ring-1 ring-[#ff5a51]"
          : "opacity-40";

  return (
    <span
      aria-label={title}
      className={`block size-3 rounded-full ${
        reportNutrientDotClassNames[nutrientName]
      } ${statusClassName}`}
      title={title}
    />
  );
}
