import { Domain } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";
import { createActor } from "xstate";

import {
  foodSearchMachine,
  getFoodNameGroupLabel,
  sortFoodsByOriginAndName,
} from "../src/food-search-machine.ts";

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
    const actor = createActor(foodSearchMachine, {
      input: {
        baseOrder: "provided",
        foods: [eggs, apple],
      },
    });

    actor.start();

    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );

    actor.send({ type: "changeQuery", query: "e" });

    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
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
    const actor = createActor(foodSearchMachine, {
      input: {
        baseOrder: "provided",
        foods: [eggs, apple],
      },
    });

    actor.start();
    actor.send({ type: "changeMacroOrder", macroOrder: "energy" });
    actor.send({ type: "changeMacroOrder", macroOrder: null });

    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );
  });
});

describe("food search price order", () => {
  it("orders price coverage by missing price, usage, then food name", async () => {
    const missingUsedBanana = await _food({
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Banana",
    });
    const missingUsedApple = await _food({
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Apple",
    });
    const missingUnused = await _food({
      createdAt: 300,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Carrot",
    });
    const pricedUsed = await _food({
      createdAt: 400,
      currentPrice: {
        priceMinor: 200,
        referenceAmount: 1,
        referenceUnit: "kg",
      },
      id: "55555555-5555-4555-8555-555555555555",
      name: "Dates",
    });
    const pricedUnused = await _food({
      createdAt: 500,
      currentPrice: {
        priceMinor: 300,
        referenceAmount: 1,
        referenceUnit: "kg",
      },
      id: "66666666-6666-4666-8666-666666666666",
      name: "Eggs",
    });
    const actor = createActor(foodSearchMachine, {
      input: {
        foods: [
          pricedUnused,
          missingUsedBanana,
          pricedUsed,
          missingUnused,
          missingUsedApple,
        ],
        macroOrder: "priceCoverage",
        usedFoodIds: [missingUsedBanana.id, missingUsedApple.id, pricedUsed.id],
      },
    });

    actor.start();

    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [
        missingUsedApple.id,
        missingUsedBanana.id,
        missingUnused.id,
        pricedUsed.id,
        pricedUnused.id,
      ]
    );
  });

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
    const actor = createActor(foodSearchMachine, {
      input: { foods: [unpriced, expensive, cheap] },
    });

    actor.start();
    actor.send({ type: "changeMacroOrder", macroOrder: "priceLow" });
    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [cheap.id, expensive.id, unpriced.id]
    );

    actor.send({ type: "changeMacroOrder", macroOrder: "priceHigh" });
    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [expensive.id, cheap.id, unpriced.id]
    );
  });
});

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
