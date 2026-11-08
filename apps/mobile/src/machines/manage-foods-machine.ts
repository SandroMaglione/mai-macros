import { FoodSearchMachine } from "@mai/machines";
import { Domain, Foods, MealEntries } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

import { Navigation } from "./services/navigation.ts";

const MealFoodUsage = Schema.Struct({
  foodId: Domain.FoodId,
  latestQuantity: Domain.LoggedFoodQuantity,
  latestUsedAt: Schema.DateTimeUtc,
  meals: Schema.Array(
    Schema.Struct({
      latestQuantity: Domain.LoggedFoodQuantity,
      latestUsedAt: Schema.DateTimeUtc,
      mealId: Domain.MealId,
    })
  ),
});

export const ManageFoodsData = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
  foods: Schema.Array(Domain.Food),
  foodUsage: Schema.Array(MealFoodUsage),
});

export type ManageFoodsData = typeof ManageFoodsData.Type;

export const ManageFoodsStates = Machine.state({
  fields: {
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    foodUsage: Schema.Array(MealFoodUsage),
  },
  states: {
    Searching: {
      fields: { foods: Schema.Array(Domain.Food) },
      states: {
        Idle: {},
        OpeningFood: { fields: { foodId: Domain.FoodId } },
      },
    },
  },
});

export const ManageFoodsMachine = Machine.make({
  id: "ManageFoods",
  root: ManageFoodsStates,
  events: FoodSearchMachine.FoodSearchParentEvents,
  input: ManageFoodsData,
  children: { foodSearch: FoodSearchMachine.FoodSearchChild },
  effects: {
    openFood: ({
      dateKey,
      foodId,
    }: {
      readonly dateKey: Domain.DateKey | undefined;
      readonly foodId: Domain.FoodId;
    }) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        yield* navigation.push({
          pathname: "/foods/[id]",
          params: {
            id: foodId,
            ...(dateKey === undefined ? {} : { dateKey }),
          },
        });
      }),
  },
  branches: {
    foodSearchSelected: { openFood: { target: "Searching.OpeningFood" } },
  },
}).handle({
  root: ({ input }) => ({
    dateKey: input.dateKey,
    foodUsage: input.foodUsage,
  }),
  initial: {
    target: "Searching",
    data: ({ input }) => ({ foods: input.foods }),
  },
  states: {
    Searching: {
      initial: { target: "Searching.Idle" },
      invoke: {
        src: "foodSearch",
        input: ({ root, state }) => ({
          foods: state.foods,
          macroOrder: null,
          usedFoodIds: root.foodUsage.map((usage) => usage.foodId),
        }),
      },
      on: {
        FoodSearchSelected: {
          branches: "foodSearchSelected",
          declinable: true,
          resolve: ({ event, select, decline }, enqueue) => {
            if (event.food === null) {
              return decline();
            }

            enqueue.sendTo(
              FoodSearchMachine.FoodSearchChild,
              FoodSearchMachine.FoodSearchEvents.ClearSelectedFood()
            );

            return select.openFood({ data: { foodId: event.food.id } });
          },
        },
      },
      states: {
        Idle: {},
        OpeningFood: {
          invoke: {
            src: "openFood",
            input: ({ root, state }) => ({
              dateKey: root.dateKey,
              foodId: state.foodId,
            }),
            onDone: { target: "Searching.Idle" },
          },
        },
      },
    },
  },
});

export const ManageFoodsLoaderStates = Machine.state({
  fields: { dateKey: Schema.UndefinedOr(Domain.DateKey) },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: ManageFoodsData } },
  },
});

export const ManageFoodsLoaderEvents = Machine.events({
  Refresh: {},
  Retry: {},
});

export const ManageFoodsLoaderMachine = Machine.make({
  id: "ManageFoodsLoader",
  root: ManageFoodsLoaderStates,
  events: ManageFoodsLoaderEvents,
  input: Schema.Struct({ dateKey: Schema.UndefinedOr(Domain.DateKey) }),
  effects: {
    load: (dateKey: Domain.DateKey | undefined) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;
        const mealEntries = yield* MealEntries.MealEntries;

        return {
          dateKey,
          foods: yield* foods.list(),
          foodUsage: yield* mealEntries.listFoodUsage(),
        };
      }),
  },
}).handle({
  root: ({ input }) => ({ dateKey: input.dateKey }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => root.dateKey,
        onDone: {
          target: "Ready",
          data: ({ output }) => ({ data: output }),
        },
        onFailure: {
          target: "Failed",
          data: { message: "Could not load foods. Please try again." },
        },
      },
    },
    Failed: {
      on: {
        Refresh: { target: "Loading" },
        Retry: { target: "Loading" },
      },
    },
    Ready: {
      on: { Refresh: { target: "Loading" } },
    },
  },
});
