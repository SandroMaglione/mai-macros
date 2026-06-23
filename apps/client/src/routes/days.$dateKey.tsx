import { createFileRoute, redirect } from "@tanstack/react-router";
import { DailyLogs, Domain, Foods, MealEntries } from "@mai/nutrition";
import { Effect, Schema } from "effect";

import { DailyLogView } from "../lib/components/daily-log-view.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";

export const Route = createFileRoute("/days/$dateKey")({
  loader: async ({ params }) => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const dateKey = yield* Schema.decodeEffect(Domain.DateKey)(
          params.dateKey
        );
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const foodsService = yield* Foods.Foods;
        const mealEntriesService = yield* MealEntries.MealEntries;
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
