import { DateKey } from "@mai/nutrition";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Array, Effect, Option, Schema } from "effect";

import { MealPlanForm } from "../lib/components/meal-plan-form.tsx";
import { submitMealPlanMachine } from "../lib/machines/meal-plan-form-machine.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { MealPlans } from "../lib/services/meal-plans.ts";

export const Route = createFileRoute("/plans/new")({
  validateSearch: (search) => ({
    dateKey:
      typeof search.dateKey === "string"
        ? Schema.decodeOption(DateKey)(search.dateKey).pipe(
            Option.match({
              onNone: () => undefined,
              onSome: (dateKey) => dateKey,
            })
          )
        : undefined,
  }),
  loader: async () =>
    RuntimeClient.runPromise(
      Effect.gen(function* () {
        const mealPlans = yield* MealPlans;
        const plans = yield* mealPlans.list();

        return {
          hasExistingPlan: Array.isReadonlyArrayNonEmpty(plans),
        };
      })
    ),
  component: Component,
});

function Component() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [snapshot, , actor] = useMachine(submitMealPlanMachine, {
    input: {
      dateKey: search.dateKey,
      navigate,
    },
  });

  return (
    <MealPlanForm
      action="create"
      actor={actor}
      backupTransferActor={
        data.hasExistingPlan ? null : snapshot.context.backupTransferActor
      }
      canNavigateBack={data.hasExistingPlan}
      dateKey={search.dateKey}
      initialPlan={null}
    />
  );
}
