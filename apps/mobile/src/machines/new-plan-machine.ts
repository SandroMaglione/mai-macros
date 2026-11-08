import { MealPlanFormMachine } from "@mai/machines";
import { Domain, MealPlans } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Schema } from "effect";

import { todayDateKey } from "../lib/date-keys.ts";
import { rejectPlanSubmission } from "./meal-plan-submission.ts";
import { Navigation } from "./services/navigation.ts";

export const NewPlanSource = Schema.Literal("settings");

export type NewPlanSource = typeof NewPlanSource.Type;

export const NewPlanRouteSearch = Schema.Union([
  Schema.TaggedStruct("Valid", {
    dateKey: Schema.optionalKey(Domain.DateKey),
    returnDateKey: Schema.optionalKey(Domain.DateKey),
    source: Schema.optionalKey(NewPlanSource),
  }),
  Schema.TaggedStruct("Invalid", {}),
]);

const NewPlanReturn = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
  returnDateKey: Schema.UndefinedOr(Domain.DateKey),
  source: Schema.UndefinedOr(NewPlanSource),
});

type NewPlanReturn = typeof NewPlanReturn.Type;

export const invalidNewPlanDateMessage =
  "The target date was not valid. Saving will return to today.";

export const NewPlanStates = Machine.state({
  type: "parallel",
  fields: {
    ...NewPlanReturn.fields,
    searchErrorMessage: Schema.UndefinedOr(Schema.String),
  },
  states: {
    Screen: {
      states: {
        Loading: {},
        Failed: { fields: { message: Schema.String } },
        Form: {
          fields: { hasExistingPlan: Schema.Boolean },
          states: {
            Ready: {
              fields: { errorMessage: Schema.UndefinedOr(Schema.String) },
            },
            Submitting: {
              fields: { input: MealPlanFormMachine.MealPlanFormSubmission },
            },
            Created: {},
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

export const NewPlanEvents = Machine.events({
  Back: {},
  Submit: { input: MealPlanFormMachine.MealPlanFormSubmission },
});

export const NewPlanMachine = Machine.make({
  id: "NewPlan",
  root: NewPlanStates,
  events: NewPlanEvents,
  input: Schema.Struct({ search: NewPlanRouteSearch }),
  effects: {
    loadExistingPlans: Effect.gen(function* () {
      const mealPlans = yield* MealPlans.MealPlans;
      const plans = yield* mealPlans.list();

      return Array.isReadonlyArrayNonEmpty(plans);
    }),
    createMealPlan: (input: MealPlanFormMachine.MealPlanFormSubmission) =>
      Effect.gen(function* () {
        const mealPlans = yield* MealPlans.MealPlans;

        yield* mealPlans.create({ input });
      }).pipe(Effect.catch(rejectPlanSubmission)),
    navigateBack: (route: NewPlanReturn) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        if (route.source === "settings") {
          return yield* _returnToSettings(route);
        }

        yield* navigation.replace(
          route.dateKey === undefined
            ? "/"
            : {
                pathname: "/days/[dateKey]",
                params: { dateKey: route.dateKey },
              }
        );
      }),
    navigateToCreatedPlanDay: (route: NewPlanReturn) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        if (route.source === "settings") {
          return yield* _returnToSettings(route);
        }

        const today = todayDateKey();
        const targetDateKey = route.dateKey ?? today;

        yield* navigation.replace(
          targetDateKey === today
            ? "/"
            : {
                pathname: "/days/[dateKey]",
                params: { dateKey: targetDateKey },
              }
        );
      }),
  },
}).handle({
  root: ({ input }) =>
    input.search._tag === "Valid"
      ? {
          dateKey: input.search.dateKey,
          returnDateKey: input.search.returnDateKey,
          searchErrorMessage: undefined,
          source: input.search.source,
        }
      : {
          dateKey: undefined,
          returnDateKey: undefined,
          searchErrorMessage: invalidNewPlanDateMessage,
          source: undefined,
        },
  initial: {},
  states: {
    Screen: {
      initial: { target: "Screen.Loading" },
      states: {
        Loading: {
          invoke: {
            src: "loadExistingPlans",
            onDone: {
              target: "Screen.Form",
              data: ({ output }) => ({ hasExistingPlan: output }),
            },
            onFailure: {
              target: "Screen.Failed",
              data: { message: "Could not load meal plans. Please try again." },
            },
          },
        },
        Failed: {},
        Form: {
          initial: {
            target: "Screen.Form.Ready",
            data: ({ root }) => ({ errorMessage: root.searchErrorMessage }),
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
                src: "createMealPlan",
                input: ({ state }) => state.input,
                onDone: { target: "Screen.Form.Created" },
                onFailure: {
                  target: "Screen.Form.Ready",
                  data: ({ error }) => ({ errorMessage: error.message }),
                },
              },
            },
            Created: {
              invoke: {
                src: "navigateToCreatedPlanDay",
                input: ({ root }) => _planReturn(root),
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
            input: ({ root }) => _planReturn(root),
            onDone: { target: "BackNavigation.Idle" },
          },
        },
      },
    },
  },
});

function _planReturn(route: NewPlanReturn): NewPlanReturn {
  return {
    dateKey: route.dateKey,
    returnDateKey: route.returnDateKey,
    source: route.source,
  };
}

function _returnToSettings(route: NewPlanReturn) {
  return Effect.gen(function* () {
    const navigation = yield* Navigation;

    if (yield* navigation.canGoBack) {
      return yield* navigation.back;
    }

    yield* navigation.replace(
      route.returnDateKey === undefined
        ? "/settings"
        : { pathname: "/settings", params: { dateKey: route.returnDateKey } }
    );
  });
}
