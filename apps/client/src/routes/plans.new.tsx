import {
  createFileRoute,
  useNavigate,
  type UseNavigateResult,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { DateKey } from "@mai/nutrition";
import { DateTime, Effect, Option, Schema } from "effect";
import { assertEvent, assign, fromPromise, setup } from "xstate";

import { BackupTransferControls } from "../lib/components/backup-transfer-controls.tsx";
import { MealPlanForm } from "../lib/components/meal-plan-form.tsx";
import { RuntimeClient } from "../lib/runtime-client.ts";
import { MealPlans } from "../lib/services/meal-plans.ts";
import {
  calculateMealPlanEnergyKcalFromFormData,
  createMealPlanInputFromFormData,
  dateKeyFromDate,
} from "../lib/utils.ts";

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

const submitMealPlanMachine = setup({
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
        }
      | {
          readonly type: "changeTargets";
          readonly formData: FormData;
        },
  },
  actors: {
    submitMealPlan: fromPromise<
      void,
      {
        readonly formData: FormData;
        readonly dateKey: string | undefined;
        readonly navigate: UseNavigateResult<string>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealPlans = yield* MealPlans;

          const mealPlanInput = yield* Effect.sync(() =>
            createMealPlanInputFromFormData({
              formData: input.formData,
            })
          );
          yield* mealPlans.create({ input: mealPlanInput });

          const today = dateKeyFromDate({
            date: yield* DateTime.nowAsDate,
          });
          const targetDateKey = input.dateKey ?? today;

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
  context: {
    energyKcal: 0,
  },
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
        src: "submitMealPlan",
        input: ({ event }) => {
          assertEvent(event, "submit");

          return {
            formData: event.formData,
            dateKey: event.dateKey,
            navigate: event.navigate,
          };
        },
        onDone: {
          target: "Created",
        },
        onError: {
          target: "Failure",
          actions: () => {
            globalThis.alert(
              "Could not create the meal plan. Plan names must be unique."
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
    Created: {},
  },
});

function Component() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [snapshot, send] = useMachine(submitMealPlanMachine);
  const isSubmitting =
    snapshot.matches("Submitting") || snapshot.matches("Created");

  return (
    <MealPlanForm
      action="create"
      backupControls={
        <BackupTransferControls
          afterImport={() => {
            if (search.dateKey === undefined) {
              return navigate({ to: "/" });
            }

            return navigate({
              to: "/days/$dateKey",
              params: { dateKey: search.dateKey },
            });
          }}
          mode="importOnly"
        />
      }
      dateKey={search.dateKey}
      disabled={isSubmitting}
      energyKcal={snapshot.context.energyKcal}
      hasFailed={snapshot.matches("Failure")}
      initialPlan={null}
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
        });
      }}
    />
  );
}
