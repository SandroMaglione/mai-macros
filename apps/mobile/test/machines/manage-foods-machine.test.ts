import { describe, expect, it } from "@effect/vitest";
import { FoodSearchMachine } from "@mai/machines";
import { Domain, Foods, MealEntries, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";
import type { Href } from "expo-router";

import {
  ManageFoodsLoaderEvents,
  ManageFoodsLoaderMachine,
  ManageFoodsLoaderStates,
  ManageFoodsMachine,
  ManageFoodsStates,
} from "@/machines/manage-foods-machine";
import { Navigation } from "@/machines/services/navigation";

const _food = Schema.decodeUnknownEffect(Domain.Food)({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Eggs",
  origin: "user",
  energyKcal: 140,
  proteinGrams: 12,
  carbsGrams: 1,
  fatGrams: 10,
  createdAt: 100,
  updatedAt: 100,
});

const _servicesLayer = ({
  foods,
}: {
  readonly foods: Effect.Effect<
    readonly Domain.Food[],
    Store.NutritionStoreError
  >;
}) =>
  Layer.mergeAll(
    Layer.mock(Foods.Foods, { list: () => foods }),
    Layer.mock(MealEntries.MealEntries, {
      listFoodUsage: () => Effect.succeed([]),
    })
  );

describe("ManageFoodsLoaderMachine", () => {
  it.live("loads the food library and reloads it on refresh", () =>
    Effect.gen(function* () {
      const food = yield* _food;
      const loader = yield* Machine.start(ManageFoodsLoaderMachine, {
        dateKey: undefined,
      });
      const ready = yield* Machine.waitFor(loader, ({ state }) =>
        ManageFoodsLoaderStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          ManageFoodsLoaderStates.get(ready.state, "Ready"),
          ({ data }) => data.foods.map(({ id }) => id)
        )
      ).toEqual(Option.some([food.id]));

      yield* loader.send(ManageFoodsLoaderEvents.Refresh());
      yield* Machine.waitFor(loader, ({ state }) =>
        ManageFoodsLoaderStates.matches(state, "Ready")
      );
    }).pipe(
      Effect.provide(
        _servicesLayer({
          foods: Effect.map(Effect.orDie(_food), (food) => [food]),
        })
      ),
      Effect.scoped
    )
  );

  it.live("shows a retryable failure when the library cannot load", () =>
    Effect.gen(function* () {
      const loader = yield* Machine.start(ManageFoodsLoaderMachine, {
        dateKey: undefined,
      });
      const failed = yield* Machine.waitFor(loader, ({ state }) =>
        ManageFoodsLoaderStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          ManageFoodsLoaderStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load foods. Please try again."));
    }).pipe(
      Effect.provide(
        _servicesLayer({
          foods: Effect.fail(
            new Store.NutritionStoreError({ cause: "database unavailable" })
          ),
        })
      ),
      Effect.scoped
    )
  );
});

describe("ManageFoodsMachine", () => {
  it.live("opens the selected food and clears the search selection", () =>
    Effect.gen(function* () {
      const food = yield* _food;
      const pushed: Href[] = [];
      const machine = yield* Machine.start(ManageFoodsMachine, {
        dateKey: Domain.DateKey.make("2026-11-08"),
        foods: [food],
        foodUsage: [],
      }).pipe(
        Effect.provide(
          Layer.mock(Navigation, {
            push: (href) => Effect.sync(() => pushed.push(href)),
          })
        )
      );
      const foodSearch = yield* Effect.flatMap(
        machine.child(FoodSearchMachine.FoodSearchChild),
        Effect.fromOption
      );

      yield* foodSearch.send(
        FoodSearchMachine.FoodSearchEvents.SelectFood({ foodId: food.id })
      );
      yield* Machine.waitFor(
        machine,
        ({ state }) =>
          pushed.length === 1 &&
          ManageFoodsStates.matches(state, "Searching.Idle")
      );
      const search = yield* foodSearch.state;

      expect(pushed).toEqual([
        {
          pathname: "/foods/[id]",
          params: { id: food.id, dateKey: "2026-11-08" },
        },
      ]);
      expect(search.value.selectedFoodId).toBeNull();
    }).pipe(Effect.scoped)
  );

  it.effect("declines an empty selection", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(ManageFoodsMachine, {
        input: { dateKey: undefined, foods: [], foodUsage: [] },
        events: [
          FoodSearchMachine.FoodSearchParentEvents.FoodSearchSelected({
            food: null,
            selection: "firstMatching",
          }),
        ],
      });

      expect(trace.finalConfiguration).toContain("Searching.Idle");
    })
  );
});
