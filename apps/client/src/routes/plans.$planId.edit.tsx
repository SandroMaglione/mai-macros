import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useActorRef } from "@xstate/react";
import { calculatePlanEnergyKcal } from "@mai/nutrition";
import { Effect } from "effect";

import { MealPlanForm } from "../lib/components/meal-plan-form.tsx";
import { reviseMealPlanMachine } from "../lib/machines/meal-plan-form-machine.ts";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { MealPlans } from "../lib/services/meal-plans.ts";

export const Route = createFileRoute("/plans/$planId/edit")({
  validateSearch: (search) => ({
    dateKey: typeof search.dateKey === "string" ? search.dateKey : undefined,
  }),
  loader: async ({ params }) => {
    const plan = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const mealPlans = yield* MealPlans;

        return yield* mealPlans.get({
          input: {
            planId: params.planId,
          },
        });
      }).pipe(
        Effect.catchTag("PlanNotFound", () => Effect.succeed(null)),
        Effect.catchTag("SchemaError", () => Effect.succeed(null))
      )
    );

    if (plan === null) {
      throw redirect({ to: "/" });
    }

    return plan;
  },
  component: Component,
});

function Component() {
  const navigate = useNavigate();
  const plan = Route.useLoaderData();
  const search = Route.useSearch();
  const actor = useActorRef(reviseMealPlanMachine, {
    input: {
      dateKey: search.dateKey,
      energyKcal: calculatePlanEnergyKcal({ plan }),
      initialPlan: plan,
      navigate,
      planId: plan.id,
    },
  });

  return (
    <MealPlanForm
      action="edit"
      actor={actor}
      dateKey={search.dateKey}
      initialPlan={plan}
    />
  );
}
