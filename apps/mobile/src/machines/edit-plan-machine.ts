import { MealPlanFormMachine } from "@mai/machines";
import { Domain, MealPlans } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

import { todayDateKey } from "../lib/date-keys.ts";
import { rejectPlanSubmission } from "./meal-plan-submission.ts";
import { Navigation } from "./services/navigation.ts";

export const EditPlanRouteParams = Schema.Union([
  Schema.TaggedStruct("Valid", {
    dateKey: Schema.optionalKey(Domain.DateKey),
    planId: Domain.PlanId,
  }),
  Schema.TaggedStruct("Invalid", {}),
]);

const ReviseMealPlanRequest = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
  input: MealPlanFormMachine.MealPlanFormSubmission,
  planId: Domain.PlanId,
});

export const EditPlanStates = Machine.state({
  type: "parallel",
  fields: {
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    planId: Schema.NullOr(Domain.PlanId),
  },
  states: {
    Screen: {
      states: {
        Loading: {},
        InvalidRoute: {},
        Failed: { fields: { message: Schema.String } },
        Form: {
          fields: { plan: Domain.Plan },
          states: {
            Ready: {
              fields: { errorMessage: Schema.UndefinedOr(Schema.String) },
            },
            Submitting: {
              fields: { input: MealPlanFormMachine.MealPlanFormSubmission },
            },
            Revised: { fields: { dateKey: Domain.DateKey } },
          },
        },
      },
    },
    BackNavigation: {
      states: {
        Idle: {},
        Navigating: {},
      },
    },
  },
});

export const EditPlanEvents = Machine.events({
  Back: {},
  Submit: { input: MealPlanFormMachine.MealPlanFormSubmission },
});

export const EditPlanMachine = Machine.make({
  id: "EditPlan",
  root: EditPlanStates,
  events: EditPlanEvents,
  input: Schema.Struct({ routeParams: EditPlanRouteParams }),
  effects: {
    loadMealPlan: (planId: Domain.PlanId | null) =>
      Effect.gen(function* () {
        if (planId === null) {
          return null;
        }

        const mealPlans = yield* MealPlans.MealPlans;

        return yield* mealPlans.get({ input: { planId } });
      }).pipe(
        Effect.catchTag("PlanNotFound", () => Effect.succeed(null)),
        Effect.catchTag("SchemaError", () => Effect.succeed(null))
      ),
    reviseMealPlan: (request: typeof ReviseMealPlanRequest.Type) =>
      Effect.gen(function* () {
        const dateKey =
          request.dateKey ??
          (yield* Schema.decodeEffect(Domain.DateKey)(todayDateKey()));
        const mealPlans = yield* MealPlans.MealPlans;

        yield* mealPlans.revise({
          input: { ...request.input, dateKey, planId: request.planId },
        });

        return dateKey;
      }).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            if (error._tag === "PlanNotFound") {
              return yield* error;
            }

            return yield* rejectPlanSubmission(error);
          })
        )
      ),
    navigateBack: (dateKey: Domain.DateKey | undefined) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        yield* navigation.replace(
          dateKey === undefined
            ? "/"
            : { pathname: "/days/[dateKey]", params: { dateKey } }
        );
      }),
    navigateToRevisedPlanDay: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        yield* navigation.replace(
          dateKey === todayDateKey()
            ? "/"
            : { pathname: "/days/[dateKey]", params: { dateKey } }
        );
      }),
    replaceHome: Effect.gen(function* () {
      const navigation = yield* Navigation;

      yield* navigation.replace("/");
    }),
  },
  branches: {
    loaded: {
      invalidRoute: { target: "Screen.InvalidRoute" },
      ready: { target: "Screen.Form" },
    },
    revisionFailed: {
      invalidRoute: { target: "Screen.InvalidRoute" },
      rejected: { target: "Screen.Form.Ready" },
    },
  },
}).handle({
  root: ({ input }) =>
    input.routeParams._tag === "Valid"
      ? {
          dateKey: input.routeParams.dateKey,
          planId: input.routeParams.planId,
        }
      : { dateKey: undefined, planId: null },
  initial: {},
  states: {
    Screen: {
      initial: { target: "Screen.Loading" },
      states: {
        Loading: {
          always: {
            target: "Screen.InvalidRoute",
            guard: ({ root }) => root.planId === null,
          },
          invoke: {
            src: "loadMealPlan",
            input: ({ root }) => root.planId,
            onDone: {
              branches: "loaded",
              resolve: ({ output, select }) =>
                output === null
                  ? select.invalidRoute()
                  : select.ready({ data: { plan: output } }),
            },
            onFailure: {
              target: "Screen.Failed",
              data: {
                message: "Could not load this meal plan. Please try again.",
              },
            },
          },
        },
        InvalidRoute: {
          invoke: { src: "replaceHome", onDone: { none: true } },
        },
        Failed: {},
        Form: {
          initial: {
            target: "Screen.Form.Ready",
            data: { errorMessage: undefined },
          },
          states: {
            Ready: {
              on: {
                Submit: {
                  target: "Screen.Form.Submitting",
                  data: ({ event }) => ({ input: event.input }),
                },
              },
            },
            Submitting: {
              invoke: {
                src: "reviseMealPlan",
                input: ({ containingState, root, state }) => ({
                  dateKey: root.dateKey,
                  input: state.input,
                  planId: containingState.plan.id,
                }),
                onDone: {
                  target: "Screen.Form.Revised",
                  data: ({ output }) => ({ dateKey: output }),
                },
                onFailure: {
                  branches: "revisionFailed",
                  resolve: ({ error, select }) =>
                    error._tag === "PlanNotFound"
                      ? select.invalidRoute()
                      : select.rejected({
                          data: { errorMessage: error.message },
                        }),
                },
              },
            },
            Revised: {
              invoke: {
                src: "navigateToRevisedPlanDay",
                input: ({ state }) => state.dateKey,
                onDone: { none: true },
              },
            },
          },
        },
      },
    },
    BackNavigation: {
      initial: { target: "BackNavigation.Idle" },
      states: {
        Idle: {
          on: { Back: { target: "BackNavigation.Navigating" } },
        },
        Navigating: {
          invoke: {
            src: "navigateBack",
            input: ({ root }) => root.dateKey,
            onDone: { target: "BackNavigation.Idle" },
          },
        },
      },
    },
  },
});
