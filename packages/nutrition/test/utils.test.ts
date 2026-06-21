import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import {
  EntryNutrients,
  Food,
  NonNegativeNumber,
  Plan,
  QuantityGrams,
} from "../src/domain.ts";
import {
  calculateEntryNutrients,
  calculateMacronutrientEnergyKcal,
  calculatePlanEnergyKcal,
  dateKeysInRange,
} from "../src/utils.ts";

const foodInput: typeof Food.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  brand: "Mai",
  origin: "user",
  energyKcalPer100g: 59,
  proteinGramsPer100g: 10,
  carbsGramsPer100g: 3.6,
  fatGramsPer100g: 0.4,
  fiberGramsPer100g: 0,
  sugarGramsPer100g: 3.2,
  saturatedFatGramsPer100g: 0.1,
  saltGramsPer100g: 0.04,
  createdAt: 0,
  updatedAt: 0,
};

const planInput: typeof Plan.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  name: "Training day",
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
    const energyKcal = calculateMacronutrientEnergyKcal({
      proteinGrams: 160,
      carbsGrams: 220,
      fatGrams: 70,
    });

    assert.equal(energyKcal, 2150);
  });

  it("calculates plan energy from macro targets and validates the result", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Plan)(planInput);
      const energyKcal = calculatePlanEnergyKcal({ plan });
      const validatedEnergyKcal =
        yield* Schema.decodeEffect(NonNegativeNumber)(energyKcal);

      return { energyKcal, validatedEnergyKcal };
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.energyKcal, 2150);
    assert.equal(result.validatedEnergyKcal, result.energyKcal);
  });

  it("calculates entry nutrients and validates the result", async () => {
    const program = Effect.gen(function* () {
      const food = yield* Schema.decodeEffect(Food)(foodInput);
      const quantityGrams = yield* Schema.decodeEffect(QuantityGrams)(150);
      const calculatedNutrients = calculateEntryNutrients({
        food,
        quantityGrams,
      });
      const validatedNutrients =
        yield* Schema.decodeEffect(EntryNutrients)(calculatedNutrients);

      return { calculatedNutrients, validatedNutrients };
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.calculatedNutrients.energyKcal, 88.5);
    assert.equal(result.validatedNutrients.energyKcal, 88.5);
    assert.equal(result.validatedNutrients.proteinGrams, 15);
    assert.equal(result.validatedNutrients.carbsGrams, 5.4);
    assert.closeTo(result.validatedNutrients.fatGrams, 0.6, 0.000_001);
  });

  it("lists date keys in a closed range", () => {
    const dateKeys = dateKeysInRange({
      endDateKey: "2026-06-21",
      startDateKey: "2026-06-19",
    });

    assert.deepEqual(dateKeys, ["2026-06-19", "2026-06-20", "2026-06-21"]);
  });

  it("handles month boundaries and leap days in date key ranges", () => {
    const dateKeys = dateKeysInRange({
      endDateKey: "2024-03-01",
      startDateKey: "2024-02-28",
    });

    assert.deepEqual(dateKeys, ["2024-02-28", "2024-02-29", "2024-03-01"]);
  });

  it("returns no date keys for reversed ranges", () => {
    const dateKeys = dateKeysInRange({
      endDateKey: "2026-06-19",
      startDateKey: "2026-06-21",
    });

    assert.deepEqual(dateKeys, []);
  });

  it("rejects invalid calendar date keys", () => {
    assert.throws(
      () =>
        dateKeysInRange({
          endDateKey: "2026-02-29",
          startDateKey: "2026-02-28",
        }),
      RangeError
    );
  });

  it("keeps missing secondary entry nutrients optional", async () => {
    const foodWithoutSecondaryNutrients = {
      id: foodInput.id,
      name: foodInput.name,
      brand: foodInput.brand,
      origin: foodInput.origin,
      energyKcalPer100g: foodInput.energyKcalPer100g,
      proteinGramsPer100g: foodInput.proteinGramsPer100g,
      carbsGramsPer100g: foodInput.carbsGramsPer100g,
      fatGramsPer100g: foodInput.fatGramsPer100g,
      createdAt: foodInput.createdAt,
      updatedAt: foodInput.updatedAt,
    };
    const program = Effect.gen(function* () {
      const food = yield* Schema.decodeEffect(Food)(
        foodWithoutSecondaryNutrients
      );
      const quantityGrams = yield* Schema.decodeEffect(QuantityGrams)(100);
      const calculatedNutrients = calculateEntryNutrients({
        food,
        quantityGrams,
      });
      const validatedNutrients =
        yield* Schema.decodeEffect(EntryNutrients)(calculatedNutrients);

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
      const failure = yield* Schema.decodeEffect(Food)({
        ...foodInput,
        energyKcalPer100g: -1,
      }).pipe(Effect.flip);

      assert.isTrue(Schema.isSchemaError(failure));
    });

    await Effect.runPromise(program);
  });
});
