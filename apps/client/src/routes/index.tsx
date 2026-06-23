import { Data, DateTime, Effect, Schema } from "effect";

import { createFileRoute, redirect } from "@tanstack/react-router";
import { DailyLogs, Domain, Foods, MealEntries } from "@mai/nutrition";
import {
  DailyLogView,
  type DailyLogViewData,
} from "../lib/components/daily-log-view.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { dateKeyFromDate } from "../lib/utils.ts";

type RouteLoaderResult = Data.TaggedEnum<{
  NoMealPlans: { readonly dateKey: Domain.DateKey };
  OpenedDay: { readonly data: DailyLogViewData };
  InvalidDateKey: {};
}>;
const RouteLoaderResult = Data.taggedEnum<RouteLoaderResult>();

export const Route = createFileRoute("/")({
  loader: async () => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const foodsService = yield* Foods.Foods;
        const mealEntriesService = yield* MealEntries.MealEntries;
        const dateKey = yield* Schema.decodeEffect(Domain.DateKey)(
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
          const foodUsage = yield* mealEntriesService.listFoodUsage();

          return RouteLoaderResult.OpenedDay({
            data: {
              day,
              foodUsage,
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
