import type { BackupTransferMachine } from "@mai/machines";
import { DateTime, Effect } from "effect";
import { MealPlans, type Domain } from "@mai/nutrition";
import type { UseNavigateResult } from "@tanstack/react-router";
import {
  assertEvent,
  assign,
  fromPromise,
  setup,
  type ActorRefFrom,
} from "xstate";

import { backupTransferMachine } from "./backup-transfer-machine.ts";
import { RuntimeClient } from "../runtime-client.ts";
import {
  calculateMealPlanEnergyKcalFromFormData,
  createMealPlanInputFromFormData,
  dateKeyFromDate,
  mealPlanFormHasChangesFromPlan,
} from "../utils.ts";

export const submitMealPlanMachine = setup({
  types: {
    context: {} as {
      readonly backupTransferActor: ActorRefFrom<typeof backupTransferMachine>;
      readonly dateKey: string | undefined;
      readonly energyKcal: number;
      readonly latestFormData: FormData | null;
      readonly navigate: UseNavigateResult<string>;
    },
    events: {} as
      | {
          readonly type: "submit";
          readonly formData: FormData;
        }
      | {
          readonly type: "changeTargets";
          readonly formData: FormData;
        }
      | BackupTransferMachine.BackupTransferImportedEvent,
    input: {} as {
      readonly dateKey: string | undefined;
      readonly navigate: UseNavigateResult<string>;
    },
  },
  actors: {
    backupTransfer: backupTransferMachine,
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
          const mealPlans = yield* MealPlans.MealPlans;

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
  context: ({ input, spawn }) => ({
    backupTransferActor: spawn("backupTransfer", {
      id: "backupTransfer",
    }),
    dateKey: input.dateKey,
    energyKcal: 0,
    latestFormData: null,
    navigate: input.navigate,
  }),
  initial: "Idle",
  on: {
    backupImported: {
      actions: ({ context }) => {
        if (context.dateKey === undefined) {
          void context.navigate({ to: "/" });
          return;
        }

        void context.navigate({
          to: "/days/$dateKey",
          params: { dateKey: context.dateKey },
        });
      },
    },
    changeTargets: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeTargets");

        return {
          energyKcal: calculateMealPlanEnergyKcalFromFormData({
            formData: event.formData,
          }),
          latestFormData: event.formData,
        };
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
        input: ({ context, event }) => {
          assertEvent(event, "submit");

          return {
            formData: event.formData,
            dateKey: context.dateKey,
            navigate: context.navigate,
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

export const reviseMealPlanMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: string | undefined;
      readonly energyKcal: number;
      readonly initialPlan: Domain.Plan;
      readonly latestFormData: FormData | null;
      readonly navigate: UseNavigateResult<string>;
      readonly planId: Domain.Plan["id"];
    },
    events: {} as
      | {
          readonly type: "submit";
          readonly formData: FormData;
        }
      | {
          readonly type: "changeTargets";
          readonly formData: FormData;
        },
    input: {} as {
      readonly dateKey: string | undefined;
      readonly energyKcal: number;
      readonly initialPlan: Domain.Plan;
      readonly navigate: UseNavigateResult<string>;
      readonly planId: Domain.Plan["id"];
    },
  },
  actors: {
    reviseMealPlan: fromPromise<
      void,
      {
        readonly formData: FormData;
        readonly dateKey: string | undefined;
        readonly navigate: UseNavigateResult<string>;
        readonly planId: Domain.Plan["id"];
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealPlans = yield* MealPlans.MealPlans;
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
  guards: {
    hasPlanChanges: ({ context, event }) => {
      assertEvent(event, "submit");

      return mealPlanFormHasChangesFromPlan({
        formData: event.formData,
        plan: context.initialPlan,
      });
    },
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey: input.dateKey,
    energyKcal: input.energyKcal,
    initialPlan: input.initialPlan,
    latestFormData: null,
    navigate: input.navigate,
    planId: input.planId,
  }),
  initial: "Idle",
  on: {
    changeTargets: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeTargets");

        return {
          energyKcal: calculateMealPlanEnergyKcalFromFormData({
            formData: event.formData,
          }),
          latestFormData: event.formData,
        };
      }),
    },
  },
  states: {
    Idle: {
      on: {
        submit: {
          guard: "hasPlanChanges",
          target: "Submitting",
        },
      },
    },
    Submitting: {
      invoke: {
        src: "reviseMealPlan",
        input: ({ context, event }) => {
          assertEvent(event, "submit");

          return {
            formData: event.formData,
            dateKey: context.dateKey,
            navigate: context.navigate,
            planId: context.planId,
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
          guard: "hasPlanChanges",
          target: "Submitting",
        },
      },
    },
    Revised: {},
  },
});

export type MealPlanFormActorRef =
  | ActorRefFrom<typeof submitMealPlanMachine>
  | ActorRefFrom<typeof reviseMealPlanMachine>;
