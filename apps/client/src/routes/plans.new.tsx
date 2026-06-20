import { DateKey } from "@mai/nutrition";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Option, Schema } from "effect";

import { MealPlanForm } from "../lib/components/meal-plan-form.tsx";
import { submitMealPlanMachine } from "../lib/machines/meal-plan-form-machine.ts";

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
  component: Component,
});

function Component() {
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
      backupTransferActor={snapshot.context.backupTransferActor}
      dateKey={search.dateKey}
      initialPlan={null}
    />
  );
}
