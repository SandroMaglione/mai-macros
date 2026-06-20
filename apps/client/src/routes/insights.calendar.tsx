import { DateKey } from "@mai/nutrition";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DateTime, Effect, Schema } from "effect";

import { MacroCalendar } from "../lib/components/macro-calendar.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { NutritionReports } from "../lib/services/nutrition-reports.ts";
import {
  dateFromMonthKey,
  dateKeyFromDate,
  endOfMonthDateKey,
  monthKeyFromDateKey,
  startOfMonthDateKey,
} from "../lib/utils.ts";

type CalendarSearch = {
  readonly month?: string;
};

export const Route = createFileRoute("/insights/calendar")({
  validateSearch: (search): CalendarSearch => {
    if (
      typeof search.month === "string" &&
      /^\d{4}-\d{2}$/.test(search.month)
    ) {
      return { month: search.month };
    }

    return {};
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const todayDate = yield* DateTime.nowAsDate;
        const monthKey =
          deps.month ??
          monthKeyFromDateKey({
            dateKey: dateKeyFromDate({ date: todayDate }),
          });
        const monthDate = dateFromMonthKey({ monthKey });
        const previousMonthDate = new Date(monthDate);
        const nextMonthDate = new Date(monthDate);

        previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
        nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);

        const reports = yield* NutritionReports;
        const report = yield* reports.getRange({
          input: {
            endDateKey: endOfMonthDateKey({ date: monthDate }),
            startDateKey: startOfMonthDateKey({ date: monthDate }),
          },
        });

        return {
          _tag: "Loaded" as const,
          data: {
            monthKey,
            nextMonthKey: monthKeyFromDateKey({
              dateKey: startOfMonthDateKey({ date: nextMonthDate }),
            }),
            previousMonthKey: monthKeyFromDateKey({
              dateKey: startOfMonthDateKey({ date: previousMonthDate }),
            }),
            report,
          },
        };
      }).pipe(
        Effect.catchTag("NoNutritionReportPlans", () =>
          Effect.gen(function* () {
            return {
              _tag: "NoPlans" as const,
              dateKey: yield* Schema.decodeEffect(DateKey)(
                dateKeyFromDate({ date: yield* DateTime.nowAsDate })
              ),
            };
          })
        ),
        Effect.catchTag("InvalidNutritionReportRange", () =>
          Effect.succeed({
            _tag: "InvalidMonth" as const,
          })
        ),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({
            _tag: "InvalidMonth" as const,
          })
        )
      )
    );

    if (result._tag === "NoPlans") {
      throw redirect({
        search: { dateKey: result.dateKey },
        to: "/plans/new",
      });
    }

    if (result._tag === "InvalidMonth") {
      throw redirect({
        search: {},
        to: "/insights/calendar",
      });
    }

    return result.data;
  },
  component: Component,
});

function Component() {
  const data = Route.useLoaderData();

  return (
    <MacroCalendar
      monthKey={data.monthKey}
      nextMonthKey={data.nextMonthKey}
      previousMonthKey={data.previousMonthKey}
      report={data.report}
    />
  );
}
