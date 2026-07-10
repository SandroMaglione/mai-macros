import { Effect, Option, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, Measurements } from "../src/index.ts";

const foodInput: typeof Domain.Food.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Milk",
  origin: "user",
  nutritionReference: { amount: 100, unit: "ml" },
  energyKcal: 60,
  proteinGrams: 3,
  carbsGrams: 5,
  fatGrams: 3,
  portions: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
      name: "X",
      position: 0,
      size: { amount: 250, unit: "ml" },
    },
  ],
  massVolumeConversion: {
    mass: { amount: 103, unit: "g" },
    volume: { amount: 100, unit: "ml" },
  },
  createdAt: 0,
  updatedAt: 0,
};

describe("food measurements", () => {
  it("converts standard mass and volume units", async () => {
    const food = await Effect.runPromise(
      Schema.decodeEffect(Domain.Food)(foodInput)
    );
    const poundsInGrams = await Effect.runPromise(
      Measurements.convertMeasuredQuantity({
        food,
        quantity: { amount: 1, unit: "lb" },
        targetUnit: "g",
      })
    );
    const litersInMilliliters = await Effect.runPromise(
      Measurements.convertMeasuredQuantity({
        food,
        quantity: { amount: 1, unit: "l" },
        targetUnit: "ml",
      })
    );

    assert.closeTo(poundsInGrams, 453.592_37, 0.000_001);
    assert.equal(litersInMilliliters, 1_000);
  });

  it("uses the food-specific equivalence across mass and volume", async () => {
    const food = await Effect.runPromise(
      Schema.decodeEffect(Domain.Food)(foodInput)
    );
    const multiplier = Measurements.nutritionMultiplierFromQuantityOption({
      food,
      quantity: await Effect.runPromise(
        Schema.decodeEffect(Domain.LoggedFoodQuantity)({
          _tag: "MeasuredFoodQuantity",
          amount: 206,
          unit: "g",
        })
      ),
    });

    assert.isTrue(Option.isSome(multiplier));
    assert.closeTo(Option.getOrThrow(multiplier), 2, 0.000_001);
  });

  it("resolves a named portion through its snapshotted physical size", async () => {
    const food = await Effect.runPromise(
      Schema.decodeEffect(Domain.Food)(foodInput)
    );
    const quantity = await Effect.runPromise(
      Schema.decodeEffect(Domain.LoggedFoodQuantity)({
        _tag: "PortionFoodQuantity",
        count: 2,
        portionId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
        portionName: "X",
        portionSize: { amount: 250, unit: "ml" },
      })
    );
    const multiplier = await Effect.runPromise(
      Measurements.nutritionMultiplierFromQuantity({ food, quantity })
    );

    assert.equal(multiplier, 5);
    assert.equal(Measurements.massGramsFromQuantity({ food, quantity }), 515);
  });

  it("does not cross dimensions without a food equivalence", async () => {
    const food = await Effect.runPromise(
      Schema.decodeEffect(Domain.Food)({
        ...foodInput,
        massVolumeConversion: undefined,
      })
    );

    const failure = await Effect.runPromise(
      Effect.flip(
        Measurements.convertMeasuredQuantity({
          food,
          quantity: { amount: 100, unit: "g" },
          targetUnit: "ml",
        })
      )
    );

    assert.equal(failure._tag, "IncompatibleFoodMeasurement");
  });
});
