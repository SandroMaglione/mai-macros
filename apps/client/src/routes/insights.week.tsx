import { DateKey } from "@mai/nutrition";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DateTime, Effect, Schema } from "effect";

import { RollingPlanBalance } from "../lib/components/rolling-plan-balance.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { NutritionReports } from "../lib/services/nutrition-reports.ts";
import { dateKeyFromDate, shiftDateKey } from "../lib/utils.ts";

export const Route = createFileRoute("/insights/week")({
  loader: async () => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const todayDateKey = dateKeyFromDate({
          date: yield* DateTime.nowAsDate,
        });
        const reports = yield* NutritionReports;
        const report = yield* reports.getRange({
          input: {
            endDateKey: todayDateKey,
            startDateKey: shiftDateKey({
              dateKey: todayDateKey,
              days: -6,
            }),
          },
        });

        return {
          _tag: "Loaded" as const,
          report,
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
            _tag: "InvalidRange" as const,
          })
        ),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({
            _tag: "InvalidRange" as const,
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

    if (result._tag === "InvalidRange") {
      throw redirect({ to: "/" });
    }

    return result.report;
  },
  component: Component,
});

function Component() {
  return <RollingPlanBalance report={Route.useLoaderData()} />;
}
