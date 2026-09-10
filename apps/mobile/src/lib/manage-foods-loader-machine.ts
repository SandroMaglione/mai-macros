import { Domain, Foods, MealEntries } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Data, Effect, Schema } from "effect";

export const MealFoodUsage = Schema.Struct({
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

class FoodLibraryLoadDefect extends Data.TaggedError("FoodLibraryLoadDefect")<{
  readonly cause: unknown;
}> {}

export const ManageFoodsLoaderEvents = Machine.events({
  refresh: {},
  retry: {},
});

const ManageFoodsLoaderStates = Machine.state({
  fields: { dateKey: Schema.UndefinedOr(Domain.DateKey) },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: ManageFoodsData } },
  },
});

const targets = Machine.targets(ManageFoodsLoaderStates);

export const manageFoodsLoaderMachine = Machine.make({
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
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new FoodLibraryLoadDefect({ cause }))
        )
      ),
  },
}).handle({
  root: ({ input }) => ({ dateKey: input.dateKey }),
  initial: { target: targets.root.Loading },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => root.dateKey,
        onDone: {
          target: targets.root.Ready,
          data: ({ output }) => ({ data: output }),
        },
        onFailure: {
          target: targets.root.Failed,
          data: { message: "Could not load foods. Please try again." },
        },
      },
    },
    Failed: {
      on: {
        refresh: { target: targets.root.Loading },
        retry: { target: targets.root.Loading },
      },
    },
    Ready: { on: { refresh: { target: targets.root.Loading } } },
  },
});
