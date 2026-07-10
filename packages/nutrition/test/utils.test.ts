import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, Utils } from "../src/index.ts";

const foodInput: typeof Domain.Food.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  brand: "Mai",
  origin: "user",
  energyKcal: 59,
  proteinGrams: 10,
  carbsGrams: 3.6,
  fatGrams: 0.4,
  fiberGrams: 0,
  sugarGrams: 3.2,
  saturatedFatGrams: 0.1,
  saltGrams: 0.04,
  createdAt: 0,
  updatedAt: 0,
};

const planInput: typeof Domain.Plan.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  name: "Training day",
  meals: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
      name: "Breakfast",
      position: 0,
      createdAt: 0,
    },
  ],
  proteinTargetGrams: 160,
  carbsTargetGrams: 220,
  fatTargetGrams: 70,
  fiberTargetGrams: 30,
  sugarTargetGrams: 50,
  saltTargetGrams: 6,
  saturatedFatTargetGrams: 20,
  createdAt: 0,
};

describe("nutrition utils", () => {
  it("calculates energy from macronutrients", () => {
    const energyKcal = Utils.calculateMacronutrientEnergyKcal({
      proteinGrams: 160,
      carbsGrams: 220,
      fatGrams: 70,
    });

    assert.equal(energyKcal, 2150);
  });

  it("calculates plan energy from macro targets and validates the result", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
      const energyKcal = Utils.calculatePlanEnergyKcal({ plan });
      const validatedEnergyKcal = yield* Schema.decodeEffect(
        Domain.NonNegativeNumber
      )(energyKcal);

      return { energyKcal, validatedEnergyKcal };
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.energyKcal, 2150);
    assert.equal(result.validatedEnergyKcal, result.energyKcal);
  });

  it("finds the dominant food macronutrients by gram amount", () => {
    assert.deepEqual(
      Utils.findDominantMacronutrients({
        food: {
          ...foodInput,
          proteinGrams: 8,
          carbsGrams: 6,
          fatGrams: 5,
        },
      }),
      ["protein"]
    );
    assert.deepEqual(
      Utils.findDominantMacronutrients({
        food: {
          ...foodInput,
          proteinGrams: 12,
          carbsGrams: 5,
          fatGrams: 1,
        },
      }),
      ["protein"]
    );
    assert.deepEqual(
      Utils.findDominantMacronutrients({
        food: {
          ...foodInput,
          proteinGrams: 4,
          carbsGrams: 16,
          fatGrams: 2,
        },
      }),
      ["carbs"]
    );
    assert.deepEqual(
      Utils.findDominantMacronutrients({
        food: {
          ...foodInput,
          proteinGrams: 4,
          carbsGrams: 5,
          fatGrams: 9,
        },
      }),
      ["fat"]
    );
  });

  it("returns every tied dominant food macronutrient", () => {
    assert.deepEqual(
      Utils.findDominantMacronutrients({
        food: {
          ...foodInput,
          proteinGrams: 0,
          carbsGrams: 0,
          fatGrams: 0,
        },
      }),
      []
    );
    assert.deepEqual(
      Utils.findDominantMacronutrients({
        food: {
          ...foodInput,
          proteinGrams: 9,
          carbsGrams: 9,
          fatGrams: 4,
        },
      }),
      ["protein", "carbs"]
    );
  });

  it("calculates entry nutrients and validates the result", async () => {
    const program = Effect.gen(function* () {
      const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
      const nutritionMultiplier = yield* Schema.decodeEffect(
        Domain.NutritionMultiplier
      )(1.5);
      const calculatedNutrients = Utils.calculateEntryNutrients({
        food,
        nutritionMultiplier,
      });
      const validatedNutrients = yield* Schema.decodeEffect(
        Domain.EntryNutrients
      )(calculatedNutrients);

      return { calculatedNutrients, validatedNutrients };
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.calculatedNutrients.energyKcal, 88.5);
    assert.equal(result.validatedNutrients.energyKcal, 88.5);
    assert.equal(result.validatedNutrients.proteinGrams, 15);
    assert.equal(result.validatedNutrients.carbsGrams, 5.4);
    assert.closeTo(result.validatedNutrients.fatGrams, 0.6, 0.000_001);
  });

  it("lists date keys in a closed range", async () => {
    const dateKeys = await Effect.runPromise(
      Utils.dateKeysInRange({
        endDateKey: "2026-06-21",
        startDateKey: "2026-06-19",
      })
    );

    assert.deepEqual(dateKeys, ["2026-06-19", "2026-06-20", "2026-06-21"]);
  });

  it("handles month boundaries and leap days in date key ranges", async () => {
    const dateKeys = await Effect.runPromise(
      Utils.dateKeysInRange({
        endDateKey: "2024-03-01",
        startDateKey: "2024-02-28",
      })
    );

    assert.deepEqual(dateKeys, ["2024-02-28", "2024-02-29", "2024-03-01"]);
  });

  it("returns no date keys for reversed ranges", async () => {
    const dateKeys = await Effect.runPromise(
      Utils.dateKeysInRange({
        endDateKey: "2026-06-19",
        startDateKey: "2026-06-21",
      })
    );

    assert.deepEqual(dateKeys, []);
  });

  it("fails with a typed error for invalid date key formats", async () => {
    const failure = await Effect.runPromise(
      Utils.dateKeysInRange({
        endDateKey: "2026-06-21",
        startDateKey: "2026/06/19",
      }).pipe(Effect.flip)
    );

    assert.instanceOf(failure, Utils.InvalidDateKey);
    assert.equal(failure.boundary, "startDateKey");
    assert.equal(failure.dateKey, "2026/06/19");
  });

  it("fails with a typed error for invalid calendar date keys", async () => {
    const failure = await Effect.runPromise(
      Utils.dateKeysInRange({
        endDateKey: "2026-02-29",
        startDateKey: "2026-02-28",
      }).pipe(Effect.flip)
    );

    assert.instanceOf(failure, Utils.InvalidDateKey);
    assert.equal(failure.boundary, "endDateKey");
    assert.equal(failure.dateKey, "2026-02-29");
  });

  it("keeps missing secondary entry nutrients optional", async () => {
    const foodWithoutSecondaryNutrients = {
      id: foodInput.id,
      name: foodInput.name,
      brand: foodInput.brand,
      origin: foodInput.origin,
      energyKcal: foodInput.energyKcal,
      proteinGrams: foodInput.proteinGrams,
      carbsGrams: foodInput.carbsGrams,
      fatGrams: foodInput.fatGrams,
      createdAt: foodInput.createdAt,
      updatedAt: foodInput.updatedAt,
    };
    const program = Effect.gen(function* () {
      const food = yield* Schema.decodeEffect(Domain.Food)(
        foodWithoutSecondaryNutrients
      );
      const nutritionMultiplier = yield* Schema.decodeEffect(
        Domain.NutritionMultiplier
      )(1);
      const calculatedNutrients = Utils.calculateEntryNutrients({
        food,
        nutritionMultiplier,
      });
      const validatedNutrients = yield* Schema.decodeEffect(
        Domain.EntryNutrients
      )(calculatedNutrients);

      return { calculatedNutrients, validatedNutrients };
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.calculatedNutrients.fiberGrams, undefined);
    assert.equal(result.validatedNutrients.sugarGrams, undefined);
    assert.equal(result.validatedNutrients.saturatedFatGrams, undefined);
    assert.equal(result.validatedNutrients.saltGrams, undefined);
  });

  it("fails when food input violates its schema", async () => {
    const program = Effect.gen(function* () {
      const failure = yield* Schema.decodeEffect(Domain.Food)({
        ...foodInput,
        energyKcal: -1,
      }).pipe(Effect.flip);

      assert.isTrue(Schema.isSchemaError(failure));
    });

    await Effect.runPromise(program);
  });
});
