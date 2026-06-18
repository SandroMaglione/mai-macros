import { createFileRoute, redirect } from "@tanstack/react-router";
import { Data, DateTime, Effect, Schema } from "effect";

import { DateKey } from "@mai/nutrition";
import {
  DailyLogView,
  type DailyLogViewData,
} from "../lib/components/daily-log-view.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { DailyLogs } from "../lib/services/daily-logs.ts";
import { Foods } from "../lib/services/foods.ts";
import { MealEntries } from "../lib/services/meal-entries.ts";
import { dateKeyFromDate } from "../lib/utils.ts";

type RouteLoaderResult = Data.TaggedEnum<{
  NoMealPlans: { readonly dateKey: DateKey };
  OpenedDay: { readonly data: DailyLogViewData };
  InvalidDateKey: {};
}>;
const RouteLoaderResult = Data.taggedEnum<RouteLoaderResult>();

export const Route = createFileRoute("/")({
  loader: async () => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs;
        const foodsService = yield* Foods;
        const mealEntriesService = yield* MealEntries;
        const dateKey = yield* Schema.decodeEffect(DateKey)(
          dateKeyFromDate({ date: yield* DateTime.nowAsDate })
        );

        return yield* Effect.gen(function* () {
          const day = yield* dailyLogs.open({ input: { dateKey } });
          const foods = yield* foodsService.list();
          const mealEntries = yield* mealEntriesService.listForDay({
            input: {
              dateKey: day.dailyLog.dateKey,
            },
          });

          return RouteLoaderResult.OpenedDay({
            data: {
              day,
              foods,
              mealEntries,
            },
          });
        }).pipe(
          Effect.catchTag("NoMealPlans", () =>
            Effect.succeed(RouteLoaderResult.NoMealPlans({ dateKey }))
          )
        );
      }).pipe(
        Effect.catchTag("SchemaError", () =>
          Effect.succeed(RouteLoaderResult.InvalidDateKey())
        )
      )
    );

    return RouteLoaderResult.$match(result, {
      NoMealPlans: ({ dateKey }) => {
        throw redirect({
          to: "/plans/new",
          search: { dateKey },
        });
      },
      InvalidDateKey: () => {
        throw redirect({ to: "/" });
      },
      OpenedDay: ({ data }) => data,
    });
  },
  component: Component,
});

function Component() {
  return <DailyLogView data={Route.useLoaderData()} />;
}
