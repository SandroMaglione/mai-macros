import {
  createFileRoute,
  redirect,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { calculatePlanEnergyKcal, type Plan } from "@mai/nutrition";
import { DateTime, Effect } from "effect";
import { assertEvent, assign, fromPromise, setup } from "xstate";

import { MealPlanForm } from "../lib/components/meal-plan-form.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { MealPlans } from "../lib/services/meal-plans.ts";
import {
  calculateMealPlanEnergyKcalFromFormData,
  createMealPlanInputFromFormData,
  dateKeyFromDate,
} from "../lib/utils.ts";

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

const reviseMealPlanMachine = setup({
  types: {
    context: {} as {
      readonly energyKcal: number;
    },
    events: {} as
      | {
          readonly type: "submit";
          readonly formData: FormData;
          readonly dateKey: string | undefined;
          readonly navigate: UseNavigateResult<string>;
          readonly planId: Plan["id"];
        }
      | {
          readonly type: "changeTargets";
          readonly formData: FormData;
        },
    input: {} as {
      readonly energyKcal: number;
    },
  },
  actors: {
    reviseMealPlan: fromPromise<
      void,
      {
        readonly formData: FormData;
        readonly dateKey: string | undefined;
        readonly navigate: UseNavigateResult<string>;
        readonly planId: Plan["id"];
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealPlans = yield* MealPlans;
          const today = dateKeyFromDate({
            date: yield* DateTime.nowAsDate,
          });
          const targetDateKey = input.dateKey ?? today;

          const mealPlanInput = yield* Effect.sync(() =>
            createMealPlanInputFromFormData({
              formData: input.formData,
            })
          );
          yield* mealPlans.revise({
            input: {
              ...mealPlanInput,
              dateKey: targetDateKey,
              planId: input.planId,
            },
          });

          if (targetDateKey === today) {
            return yield* Effect.promise(() => input.navigate({ to: "/" }));
          }

          return yield* Effect.promise(() =>
            input.navigate({
              to: "/days/$dateKey",
              params: { dateKey: targetDateKey },
            })
          );
        })
      )
    ),
  },
}).createMachine({
  context: ({ input }) => ({
    energyKcal: input.energyKcal,
  }),
  initial: "Idle",
  on: {
    changeTargets: {
      actions: assign({
        energyKcal: ({ event }) => {
          assertEvent(event, "changeTargets");

          return calculateMealPlanEnergyKcalFromFormData({
            formData: event.formData,
          });
        },
      }),
    },
  },
  states: {
    Idle: {
      on: {
        submit: {
          target: "Submitting",
        },
      },
    },
    Submitting: {
      invoke: {
        src: "reviseMealPlan",
        input: ({ event }) => {
          assertEvent(event, "submit");

          return {
            formData: event.formData,
            dateKey: event.dateKey,
            navigate: event.navigate,
            planId: event.planId,
          };
        },
        onDone: {
          target: "Revised",
        },
        onError: {
          target: "Failure",
          actions: () => {
            globalThis.alert(
              "Could not update the meal plan. Plan names must be unique."
            );
          },
        },
      },
    },
    Failure: {
      on: {
        submit: {
          target: "Submitting",
        },
      },
    },
    Revised: {},
  },
});

function Component() {
  const navigate = useNavigate();
  const plan = Route.useLoaderData();
  const search = Route.useSearch();
  const [snapshot, send] = useMachine(reviseMealPlanMachine, {
    input: {
      energyKcal: calculatePlanEnergyKcal({ plan }),
    },
  });
  const isSubmitting =
    snapshot.matches("Submitting") || snapshot.matches("Revised");

  return (
    <MealPlanForm
      action="edit"
      backupControls={null}
      dateKey={search.dateKey}
      disabled={isSubmitting}
      energyKcal={snapshot.context.energyKcal}
      hasFailed={snapshot.matches("Failure")}
      initialPlan={plan}
      onInput={(formData) => {
        send({
          type: "changeTargets",
          formData,
        });
      }}
      onSubmit={(formData) => {
        send({
          type: "submit",
          formData,
          dateKey: search.dateKey,
          navigate,
          planId: plan.id,
        });
      }}
    />
  );
}
