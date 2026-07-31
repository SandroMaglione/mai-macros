import { Domain } from "@mai/nutrition";
import { Effect, Option, Schema } from "effect";
import { assert, describe, it } from "vitest";

import {
  ChangeFoodSearchMacroOrder,
  ChangeFoodSearchQuery,
  FoodSearchStates,
  foodSearchMachine,
  getFoodNameGroupLabel,
  sortFoodsByOriginAndName,
} from "../src/food-search-machine.ts";
import { Machine } from "@typeonce/effect-machine";

describe("food search name groups", () => {
  it("labels the newest same-name-and-brand food and sorts it first", async () => {
    const older = await _food({
      brand: " FAGE ",
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Greek Yogurt",
    });
    const newest = await _food({
      brand: "fage",
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: " greek yogurt ",
    });
    const unrelated = await _food({
      createdAt: 300,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Milk",
    });
    const foods = [older, unrelated, newest];

    assert.equal(getFoodNameGroupLabel({ food: newest, foods }), "Newest");
    assert.equal(getFoodNameGroupLabel({ food: older, foods }), "Older");
    assert.equal(getFoodNameGroupLabel({ food: unrelated, foods }), null);
    assert.deepEqual(
      sortFoodsByOriginAndName({ foods })
        .filter(
          (food) => food.name.trim().toLocaleLowerCase() === "greek yogurt"
        )
        .map((food) => food.id),
      [newest.id, older.id]
    );
  });
});

describe("food search base order", () => {
  it("preserves a caller-provided order through filtering", async () => {
    const eggs = await _food({
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Eggs",
    });
    const apple = await _food({
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Apple",
    });
    const initial = await Effect.runPromise(
      Machine.planInitial(foodSearchMachine, {
        baseOrder: "provided",
        foods: [eggs, apple],
      })
    );

    assert.deepEqual(
      _foodSearchState(initial.state).matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );

    const changed = await Effect.runPromise(
      Machine.plan(
        foodSearchMachine,
        initial.state,
        new ChangeFoodSearchQuery({ query: "e" })
      )
    );

    assert.deepEqual(
      _foodSearchState(changed.next).matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );
  });

  it("restores a caller-provided order after clearing a macro order", async () => {
    const eggs = await _food({
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Eggs",
    });
    const apple = await _food({
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Apple",
    });
    const initial = await Effect.runPromise(
      Machine.planInitial(foodSearchMachine, {
        baseOrder: "provided",
        foods: [eggs, apple],
      })
    );
    const ordered = await Effect.runPromise(
      Machine.plan(
        foodSearchMachine,
        initial.state,
        new ChangeFoodSearchMacroOrder({ macroOrder: "energy" })
      )
    );
    const cleared = await Effect.runPromise(
      Machine.plan(
        foodSearchMachine,
        ordered.next,
        new ChangeFoodSearchMacroOrder({ macroOrder: null })
      )
    );

    assert.deepEqual(
      _foodSearchState(cleared.next).matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );
  });
});

describe("food search price order", () => {
  it("normalizes current euro prices and leaves unpriced foods last", async () => {
    const cheap = await _food({
      createdAt: 100,
      currentPrice: {
        priceMinor: 300,
        referenceAmount: 1,
        referenceUnit: "kg",
      },
      id: "11111111-1111-4111-8111-111111111111",
      name: "Cheap",
    });
    const expensive = await _food({
      createdAt: 200,
      currentPrice: {
        priceMinor: 200,
        referenceAmount: 100,
        referenceUnit: "g",
      },
      id: "22222222-2222-4222-8222-222222222222",
      name: "Expensive",
    });
    const unpriced = await _food({
      createdAt: 300,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Unpriced",
    });
    const initial = await Effect.runPromise(
      Machine.planInitial(foodSearchMachine, {
        foods: [unpriced, expensive, cheap],
      })
    );
    const priceLow = await Effect.runPromise(
      Machine.plan(
        foodSearchMachine,
        initial.state,
        new ChangeFoodSearchMacroOrder({ macroOrder: "priceLow" })
      )
    );
    assert.deepEqual(
      _foodSearchState(priceLow.next).matchingFoods.map((food) => food.id),
      [cheap.id, expensive.id, unpriced.id]
    );

    const priceHigh = await Effect.runPromise(
      Machine.plan(
        foodSearchMachine,
        priceLow.next,
        new ChangeFoodSearchMacroOrder({ macroOrder: "priceHigh" })
      )
    );
    assert.deepEqual(
      _foodSearchState(priceHigh.next).matchingFoods.map((food) => food.id),
      [expensive.id, cheap.id, unpriced.id]
    );
  });
});

function _foodSearchState(
  snapshot: Machine.Machine.Snapshot<typeof FoodSearchStates.states>
) {
  return Option.getOrThrow(FoodSearchStates.get(snapshot, "Ready"));
}

function _food({
  brand,
  createdAt,
  currentPrice,
  id,
  name,
}: {
  readonly brand?: string | undefined;
  readonly createdAt: number;
  readonly currentPrice?:
    | {
        readonly priceMinor: number;
        readonly referenceAmount: number;
        readonly referenceUnit: Domain.MeasurementUnit;
      }
    | undefined;
  readonly id: string;
  readonly name: string;
}) {
  return Effect.runPromise(
    Schema.decodeEffect(Domain.Food)({
      id,
      name,
      ...(brand === undefined ? {} : { brand }),
      origin: "user",
      energyKcal: 60,
      proteinGrams: 3,
      carbsGrams: 5,
      fatGrams: 3,
      ...(currentPrice === undefined
        ? {}
        : {
            prices: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                priceMinor: currentPrice.priceMinor,
                currency: "EUR",
                referenceQuantity: {
                  amount: currentPrice.referenceAmount,
                  unit: currentPrice.referenceUnit,
                },
                isCurrent: true,
                createdAt,
                updatedAt: createdAt,
              },
            ],
          }),
      createdAt,
      updatedAt: createdAt,
    })
  );
}
