import * as Domain from "@mai/nutrition/domain";
import * as Reporting from "@mai/nutrition/reporting";
import * as DailyLogs from "@mai/nutrition/services/daily-logs";
import * as Foods from "@mai/nutrition/services/foods";
import * as MealEntries from "@mai/nutrition/services/meal-entries";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Match, Schema } from "effect";

import { todayDateKey } from "../lib/date-keys.ts";
import { Navigation } from "./services/navigation.ts";

const OpenedDay = Schema.TaggedStruct("OpenedDay", {
  dailyLog: Domain.DailyLog,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const MacroDetailsScope = Schema.Union([
  Schema.TaggedStruct("Day", {}),
  Schema.TaggedStruct("Meal", {
    meal: Domain.MealId,
  }),
]);

export const MacroDetailsRouteData = Schema.Struct({
  dateKey: Domain.DateKey,
  day: OpenedDay,
  foods: Schema.Array(Domain.Food),
  mealEntries: Schema.Array(Domain.MealEntry),
  scope: MacroDetailsScope,
});

export type MacroDetailsRouteData = typeof MacroDetailsRouteData.Type;

const MacroDetailsRouteInput = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Schema.UndefinedOr(Domain.MealId),
});

export const MacroDetailsRouteStates = Machine.state({
  fields: {
    dateKey: Domain.DateKey,
    meal: Schema.UndefinedOr(Domain.MealId),
  },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: MacroDetailsRouteData } },
    Redirected: { fields: { dateKey: Domain.DateKey } },
  },
});

export const MacroDetailsRouteEvents = Machine.events({ Reload: {} });

export const MacroDetailsRouteMachine = Machine.make({
  id: "MacroDetailsRoute",
  root: MacroDetailsRouteStates,
  events: MacroDetailsRouteEvents,
  input: MacroDetailsRouteInput,
  effects: {
    loadMacroDetails: (input: typeof MacroDetailsRouteInput.Type) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const foodsService = yield* Foods.Foods;
        const mealEntriesService = yield* MealEntries.MealEntries;
        const day = yield* input.dateKey === todayDateKey()
          ? dailyLogs.openOrCreate({
              input: {
                dateKey: input.dateKey,
              },
            })
          : dailyLogs.open({
              input: {
                dateKey: input.dateKey,
              },
            });

        if (day._tag === "UnrecordedDay") {
          return {
            _tag: "UnrecordedDay" as const,
            dateKey: day.dateKey,
          };
        }

        const selectedMeal =
          input.meal === undefined
            ? undefined
            : day.selectedPlan.meals.find(
                (planMeal) => planMeal.id === input.meal
              );

        if (input.meal !== undefined && selectedMeal === undefined) {
          return {
            _tag: "InvalidRoute" as const,
          };
        }

        const dayMealEntries = yield* mealEntriesService.listForDay({
          input: {
            dateKey: day.dailyLog.dateKey,
          },
        });
        const mealEntries =
          input.meal === undefined
            ? dayMealEntries
            : dayMealEntries.filter(
                (mealEntry) => mealEntry.mealId === input.meal
              );
        const foods = yield* foodsService.getMany({
          input: {
            foodIds: Domain.mealEntryFoodIds(mealEntries),
          },
        });

        return {
          _tag: "Ready" as const,
          data: {
            dateKey: day.dailyLog.dateKey,
            day,
            foods,
            mealEntries,
            scope:
              input.meal === undefined
                ? {
                    _tag: "Day" as const,
                  }
                : {
                    _tag: "Meal" as const,
                    meal: input.meal,
                  },
          },
        };
      }).pipe(
        Effect.catchTag("NoMealPlans", ({ dateKey }) =>
          Effect.succeed({
            _tag: "NoMealPlans" as const,
            dateKey,
          })
        )
      ),
    redirectToNewPlan: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        yield* navigation.replace({
          pathname: "/plans/new",
          params: { dateKey },
        });
      }),
  },
  branches: {
    loaded: {
      invalidRoute: { target: "Failed", title: "Meal not in plan" },
      noMealPlans: { target: "Redirected", title: "No meal plans" },
      ready: { target: "Ready", title: "Details loaded" },
      unrecordedDay: { target: "Failed", title: "Day not created" },
    },
  },
}).handle({
  root: ({ input }) => ({ dateKey: input.dateKey, meal: input.meal }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "loadMacroDetails",
        input: ({ root }) => ({ dateKey: root.dateKey, meal: root.meal }),
        onDone: {
          branches: "loaded",
          resolve: ({ output, select }) =>
            Match.value(output).pipe(
              Match.tagsExhaustive({
                InvalidRoute: () =>
                  select.invalidRoute({
                    data: { message: "Could not find this meal." },
                  }),
                NoMealPlans: ({ dateKey }) =>
                  select.noMealPlans({ data: { dateKey } }),
                Ready: ({ data }) => select.ready({ data: { data } }),
                UnrecordedDay: () =>
                  select.unrecordedDay({
                    data: {
                      message: "Create this day before viewing details.",
                    },
                  }),
              })
            ),
        },
        onFailure: {
          target: "Failed",
          data: { message: "Could not load nutrition details." },
        },
      },
    },
    Failed: {
      on: { Reload: { target: "Loading" } },
    },
    Ready: {
      on: { Reload: { target: "Loading" } },
    },
    Redirected: {
      invoke: {
        src: "redirectToNewPlan",
        input: ({ state }) => state.dateKey,
        onDone: { none: true },
      },
    },
  },
});

const FoodWeightMetricName = "foodWeightGrams";
const FoodCostMetricName = "foodCostEur";

export const MacroDetailMetricName = Schema.Literals([
  ...Reporting.NutrientNames,
  FoodWeightMetricName,
  FoodCostMetricName,
]);

export const MacroDetailsSelectionStates = Machine.state({
  fields: {
    includeEstimates: Schema.Boolean,
    selectedMetricName: Schema.NullOr(MacroDetailMetricName),
  },
});

export const MacroDetailsSelectionEvents = Machine.events({
  ClearSelection: {},
  SelectMetric: { metricName: MacroDetailMetricName },
  ToggleEstimates: {},
});

export const MacroDetailsSelectionMachine = Machine.make({
  id: "MacroDetailsSelection",
  root: MacroDetailsSelectionStates,
  events: MacroDetailsSelectionEvents,
}).handle({
  root: { includeEstimates: true, selectedMetricName: null },
  on: {
    ClearSelection: {
      update: "root",
      data: ({ root }) => ({ ...root, selectedMetricName: null }),
    },
    SelectMetric: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        selectedMetricName:
          root.selectedMetricName === event.metricName
            ? null
            : event.metricName,
      }),
    },
    ToggleEstimates: {
      update: "root",
      data: ({ root }) => ({
        ...root,
        includeEstimates: !root.includeEstimates,
      }),
    },
  },
});
