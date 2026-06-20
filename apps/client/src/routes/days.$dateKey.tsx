import { createFileRoute, redirect } from "@tanstack/react-router";
import { DateKey } from "@mai/nutrition";
import { Effect, Schema } from "effect";

import { DailyLogView } from "../lib/components/daily-log-view.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { DailyLogs } from "@mai/nutrition/services/daily-logs";
import { Foods } from "@mai/nutrition/services/foods";
import { MealEntries } from "@mai/nutrition/services/meal-entries";

export const Route = createFileRoute("/days/$dateKey")({
  loader: async ({ params }) => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const dateKey = yield* Schema.decodeEffect(DateKey)(params.dateKey);
        const dailyLogs = yield* DailyLogs;
        const foodsService = yield* Foods;
        const mealEntriesService = yield* MealEntries;
        const day = yield* dailyLogs.open({
          input: {
            dateKey,
          },
        });
        const foods = yield* foodsService.list();
        const mealEntries = yield* mealEntriesService.listForDay({
          input: {
            dateKey: day.dailyLog.dateKey,
          },
        });
        const foodUsage = yield* mealEntriesService.listFoodUsage();

        return {
          _tag: "OpenedDay" as const,
          data: {
            day,
            foodUsage,
            foods,
            mealEntries,
          },
        };
      }).pipe(
        Effect.catchTag("NoMealPlans", ({ dateKey }) =>
          Effect.succeed({
            _tag: "NoMealPlans" as const,
            dateKey,
          })
        ),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({
            _tag: "InvalidDateKey" as const,
          })
        )
      )
    );

    if (result._tag === "InvalidDateKey") {
      throw redirect({ to: "/" });
    }

    if (result._tag === "NoMealPlans") {
      throw redirect({
        to: "/plans/new",
        search: {
          dateKey: result.dateKey,
        },
      });
    }

    return result.data;
  },
  component: Component,
});

function Component() {
  return <DailyLogView data={Route.useLoaderData()} />;
}
