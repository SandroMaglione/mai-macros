import { createFileRoute, redirect } from "@tanstack/react-router";
import { Effect } from "effect";

import { DailyLogView } from "../lib/components/daily-log-view.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { DailyLogs } from "../lib/services/daily-logs.ts";
import { Foods } from "../lib/services/foods.ts";
import { MealEntries } from "../lib/services/meal-entries.ts";

export const Route = createFileRoute("/days/$dateKey")({
  loader: async ({ params }) => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs;
        const foodsService = yield* Foods;
        const mealEntriesService = yield* MealEntries;
        const day = yield* dailyLogs.open({
          input: {
            dateKey: params.dateKey,
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
          day,
          foodUsage,
          foods,
          mealEntries,
        };
      }).pipe(Effect.catchTag("NoMealPlans", () => Effect.succeed(null)))
    );

    if (result === null) {
      throw redirect({
        to: "/plans/new",
        search: {
          dateKey: params.dateKey,
        },
      });
    }

    return result;
  },
  component: Component,
});

function Component() {
  return <DailyLogView data={Route.useLoaderData()} />;
}
