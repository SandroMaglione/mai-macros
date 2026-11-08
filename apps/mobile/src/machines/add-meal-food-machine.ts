import { FoodSearchMachine } from "@mai/machines";
import { DailyLogs, Domain, Foods, MealEntries } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Match, Order, Schema } from "effect";

import { todayDateKey } from "../lib/date-keys.ts";
import * as FoodMeasurements from "../lib/food-measurements.ts";
import { Navigation } from "./services/navigation.ts";

const MealFoodUsage = Schema.Struct({
  foodId: Domain.FoodId,
  latestQuantity: Domain.LoggedFoodQuantity,
  latestUsedAt: Schema.DateTimeUtcFromMillis,
  meals: Schema.Array(
    Schema.Struct({
      latestQuantity: Domain.LoggedFoodQuantity,
      latestUsedAt: Schema.DateTimeUtcFromMillis,
      mealId: Domain.MealId,
    })
  ),
});

export const AddMealFoodData = Schema.Struct({
  dateKey: Domain.DateKey,
  foodUsage: Schema.Array(MealFoodUsage),
  foods: Schema.Array(Domain.Food),
  meal: Domain.MealId,
  mealLabel: Schema.NonEmptyString,
});

export type AddMealFoodData = typeof AddMealFoodData.Type;

const AddMealFoodRoute = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
});

export function findFoodUsage({
  foodId,
  foodUsage,
}: {
  readonly foodId: Domain.FoodId;
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
}) {
  return foodUsage.find((usage) => usage.foodId === foodId);
}

export const AddMealFoodLoaderStates = Machine.state({
  fields: AddMealFoodRoute.fields,
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: AddMealFoodData } },
    Redirecting: { fields: { dateKey: Domain.DateKey } },
    Redirected: {},
  },
});

export const AddMealFoodLoaderMachine = Machine.make({
  id: "AddMealFoodLoader",
  root: AddMealFoodLoaderStates,
  events: Machine.events({}),
  input: AddMealFoodRoute,
  effects: {
    load: ({ dateKey, meal }: typeof AddMealFoodRoute.Type) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const foodsService = yield* Foods.Foods;
        const mealEntriesService = yield* MealEntries.MealEntries;
        const today = yield* Effect.sync(todayDateKey);
        const day = yield* dateKey === today
          ? dailyLogs.openOrCreate({ input: { dateKey } })
          : dailyLogs.open({ input: { dateKey } });

        if (day._tag === "UnrecordedDay") {
          return { _tag: "UnrecordedDay" as const };
        }

        const foods = yield* foodsService.list();
        const foodUsage = yield* mealEntriesService.listFoodUsage();
        const planMeal = day.selectedPlan.meals.find(
          (candidate) => candidate.id === meal
        );

        if (planMeal === undefined) {
          return { _tag: "InvalidRoute" as const };
        }

        return {
          _tag: "Ready" as const,
          data: {
            dateKey: day.dailyLog.dateKey,
            foodUsage,
            foods,
            meal,
            mealLabel: planMeal.name,
          },
        };
      }).pipe(
        Effect.catchTag("NoMealPlans", (error) =>
          Effect.succeed({
            _tag: "NoMealPlans" as const,
            dateKey: error.dateKey,
          })
        )
      ),
    replaceNewPlan: (dateKey: Domain.DateKey) =>
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
      failed: { target: "Failed" },
      ready: { target: "Ready" },
      redirecting: { target: "Redirecting" },
    },
  },
}).handle({
  root: ({ input }) => ({ dateKey: input.dateKey, meal: input.meal }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => ({ dateKey: root.dateKey, meal: root.meal }),
        onDone: {
          branches: "loaded",
          resolve: ({ output, select }) =>
            Match.value(output).pipe(
              Match.tagsExhaustive({
                InvalidRoute: () =>
                  select.failed({
                    data: { message: "Could not find this meal." },
                  }),
                NoMealPlans: ({ dateKey }) =>
                  select.redirecting({ data: { dateKey } }),
                Ready: ({ data }) => select.ready({ data: { data } }),
                UnrecordedDay: () =>
                  select.failed({
                    data: { message: "Create this day before adding food." },
                  }),
              })
            ),
        },
        onFailure: {
          target: "Failed",
          data: { message: "Could not load this meal." },
        },
      },
    },
    Failed: {},
    Ready: {},
    Redirecting: {
      invoke: {
        src: "replaceNewPlan",
        input: ({ state }) => state.dateKey,
        onDone: { target: "Redirected" },
      },
    },
    Redirected: {},
  },
});

export const AddMealFoodStates = Machine.state({
  fields: {
    dateKey: Domain.DateKey,
    foodUsage: Schema.Array(MealFoodUsage),
    foods: Schema.Array(Domain.Food),
    meal: Domain.MealId,
    mealLabel: Schema.NonEmptyString,
    notice: Schema.NullOr(Schema.String),
    portionId: Schema.NullOr(Domain.FoodPortionId),
    quantityAccuracy: Domain.QuantityAccuracy,
    quantityAmount: Schema.String,
    quantityUnit: Domain.MeasurementUnit,
  },
  states: {
    Logging: {
      states: {
        SelectingFood: {},
        Quantity: {
          fields: { selectedFood: Domain.Food },
          states: {
            Entering: {},
            Submitting: {},
            Submitted: {},
          },
        },
      },
    },
  },
});

export const AddMealFoodEvents = Machine.events({
  ChangeAccuracy: { accuracy: Domain.QuantityAccuracy },
  ChangeQuantity: { quantityAmount: Schema.String },
  ClearSelectedFood: {},
  SelectMeasurementUnit: { unit: Domain.MeasurementUnit },
  SelectPortion: { portionId: Domain.FoodPortionId },
  Submit: {},
});

const _addMealEntryNotice = Match.type<{ readonly _tag: string }>().pipe(
  Match.tags({
    FoodNotFound: () =>
      "Could not find that food. Pick another food and try again.",
    MealNotFound: () =>
      "Could not find that food. Pick another food and try again.",
    SchemaError: () => "Enter a quantity greater than zero.",
  }),
  Match.orElse(
    () => "Could not add the meal entry. Check the quantity and try again."
  )
);

export const AddMealFoodMachine = Machine.make({
  id: "AddMealFood",
  root: AddMealFoodStates,
  events: Machine.eventsFromSchemas(
    AddMealFoodEvents,
    FoodSearchMachine.FoodSearchParentEvents
  ),
  input: AddMealFoodData,
  children: { foodSearch: FoodSearchMachine.FoodSearchChild },
  effects: {
    addMealEntry: (input: MealEntries.CreateMealEntryInput) =>
      Effect.gen(function* () {
        const mealEntries = yield* MealEntries.MealEntries;

        yield* mealEntries.create({ input });
      }),
    replaceAfterSubmit: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;
        const today = yield* Effect.sync(todayDateKey);

        yield* dateKey === today
          ? navigation.replace("/")
          : navigation.replace({
              pathname: "/days/[dateKey]",
              params: { dateKey },
            });
      }),
  },
  branches: {
    foodSearchSelected: {
      quantity: { target: "Logging.Quantity", update: "root" },
      selecting: { update: "root" },
    },
    clearSelectedFood: {
      selecting: { target: "Logging.SelectingFood" },
    },
  },
}).handle({
  root: ({ input }) => ({
    dateKey: input.dateKey,
    foodUsage: input.foodUsage,
    foods: input.foods,
    meal: input.meal,
    mealLabel: input.mealLabel,
    notice: null,
    portionId: null,
    quantityAccuracy: "unspecified",
    quantityAmount: "",
    quantityUnit: "g",
  }),
  initial: { target: "Logging" },
  states: {
    Logging: {
      initial: { target: "Logging.SelectingFood" },
      invoke: {
        src: "foodSearch",
        input: ({ root }) => ({
          baseOrder: "provided",
          foods: Array.sortBy(
            Order.mapInput(
              Order.flip(Order.Number),
              (food: Domain.Food) =>
                findFoodUsage({
                  foodId: food.id,
                  foodUsage: root.foodUsage,
                })?.meals.find((usage) => usage.mealId === root.meal)
                  ?.latestUsedAt.epochMilliseconds ?? Number.NEGATIVE_INFINITY
            ),
            FoodSearchMachine.foodUserOriginOrder,
            FoodSearchMachine.foodLowercaseNameOrder
          )(root.foods),
        }),
      },
      states: {
        SelectingFood: {
          on: {
            FoodSearchSelected: {
              branches: "foodSearchSelected",
              resolve: ({ event, root, select }) => {
                if (event.food === null) {
                  return select.selecting({ data: { ...root, notice: null } });
                }

                const mealUsage = findFoodUsage({
                  foodId: event.food.id,
                  foodUsage: root.foodUsage,
                })?.meals.find((usage) => usage.mealId === root.meal);
                const quantitySelection =
                  event.selection === "firstMatching" &&
                  root.quantityAmount.trim() !== ""
                    ? {
                        portionId: root.portionId,
                        quantityAmount: root.quantityAmount,
                        quantityUnit: root.quantityUnit,
                      }
                    : FoodMeasurements.quantitySelectionFromLoggedQuantity({
                        food: event.food,
                        quantity: mealUsage?.latestQuantity,
                      });

                return select.quantity({
                  data: { selectedFood: event.food },
                  update: {
                    data: { ...root, ...quantitySelection, notice: null },
                  },
                });
              },
            },
          },
        },
        Quantity: {
          initial: { target: "Logging.Quantity.Entering" },
          states: {
            Entering: {
              on: {
                ChangeAccuracy: {
                  update: "root",
                  data: ({ root, event }) => ({
                    ...root,
                    quantityAccuracy: event.accuracy,
                  }),
                },
                ChangeQuantity: {
                  update: "root",
                  data: ({ root, event }) => ({
                    ...root,
                    quantityAmount: event.quantityAmount,
                  }),
                },
                SelectMeasurementUnit: {
                  update: "root",
                  data: ({ root, event }) => ({
                    ...root,
                    portionId: null,
                    quantityUnit: event.unit,
                  }),
                },
                SelectPortion: {
                  update: "root",
                  data: ({ root, event }) => ({
                    ...root,
                    portionId: event.portionId,
                  }),
                },
                ClearSelectedFood: {
                  branches: "clearSelectedFood",
                  resolve: ({ select }, enqueue) => {
                    enqueue.sendTo(
                      FoodSearchMachine.FoodSearchChild,
                      FoodSearchMachine.FoodSearchEvents.ClearSelectedFood()
                    );

                    return select.selecting();
                  },
                },
                Submit: {
                  target: "Logging.Quantity.Submitting",
                  guard: ({ root }) => root.quantityAmount.trim() !== "",
                },
              },
            },
            Submitting: {
              invoke: {
                src: "addMealEntry",
                input: ({ root, ancestors }) => ({
                  dateKey: root.dateKey,
                  foodId: ancestors["Logging.Quantity"].selectedFood.id,
                  mealId: root.meal,
                  quantity:
                    FoodMeasurements.mealEntryQuantityInputFromSelection({
                      portionId: root.portionId,
                      quantityAmount: root.quantityAmount,
                      quantityUnit: root.quantityUnit,
                    }),
                  quantityAccuracy: root.quantityAccuracy,
                }),
                onDone: { target: "Logging.Quantity.Submitted" },
                onFailure: {
                  target: "Logging.Quantity.Entering",
                  update: "root",
                  data: ({ root, error }) => ({
                    target: undefined,
                    update: { ...root, notice: _addMealEntryNotice(error) },
                  }),
                },
              },
            },
            Submitted: {
              invoke: {
                src: "replaceAfterSubmit",
                input: ({ root }) => root.dateKey,
                onDone: { none: true },
              },
            },
          },
        },
      },
    },
  },
});
