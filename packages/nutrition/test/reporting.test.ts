import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Food, Plan, QuantityGrams } from "../src/domain.ts";
import {
  calculateEntriesNutrientTotals,
  evaluateNutrientTarget,
  evaluatePlanNutrientTargets,
  getPlanNutrientTarget,
  isInsideExpectedPlanRange,
  makeNutrientTarget,
  NutrientTargetSemanticsByName,
} from "../src/reporting.ts";

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

const completeFoodInput: typeof Food.Encoded = {
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

const partialFoodInput: typeof Food.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
  name: "Rice",
  origin: "user",
  energyKcalPer100g: 130,
  proteinGramsPer100g: 2.7,
  carbsGramsPer100g: 28,
  fatGramsPer100g: 0.3,
  createdAt: 0,
  updatedAt: 0,
};

describe("nutrition reporting", () => {
  it("assigns target semantics by nutrient behavior", () => {
    assert.equal(NutrientTargetSemanticsByName.proteinGrams, "minimum");
    assert.equal(NutrientTargetSemanticsByName.fiberGrams, "minimum");
    assert.equal(NutrientTargetSemanticsByName.sugarGrams, "maximum");
    assert.equal(NutrientTargetSemanticsByName.saltGrams, "maximum");
    assert.equal(NutrientTargetSemanticsByName.saturatedFatGrams, "maximum");
    assert.equal(NutrientTargetSemanticsByName.energyKcal, "range");
    assert.equal(NutrientTargetSemanticsByName.carbsGrams, "range");
    assert.equal(NutrientTargetSemanticsByName.fatGrams, "range");
  });

  it("evaluates range targets with the default tolerance", () => {
    const target = makeNutrientTarget({
      amount: 2000,
      nutrientName: "energyKcal",
    });

    assert.equal(
      evaluateNutrientTarget({ target, value: 1800 }).status,
      "inside"
    );
    assert.equal(
      evaluateNutrientTarget({ target, value: 2200 }).status,
      "inside"
    );
    assert.equal(
      evaluateNutrientTarget({ target, value: 1799 }).status,
      "below"
    );
    assert.equal(
      evaluateNutrientTarget({ target, value: 2201 }).status,
      "above"
    );
  });

  it("evaluates minimum and maximum targets with directional semantics", () => {
    const proteinTarget = makeNutrientTarget({
      amount: 160,
      nutrientName: "proteinGrams",
    });
    const sugarTarget = makeNutrientTarget({
      amount: 50,
      nutrientName: "sugarGrams",
    });

    assert.equal(
      evaluateNutrientTarget({ target: proteinTarget, value: 159 }).status,
      "below"
    );
    assert.equal(
      evaluateNutrientTarget({ target: proteinTarget, value: 170 }).status,
      "inside"
    );
    assert.equal(
      evaluateNutrientTarget({ target: sugarTarget, value: 49 }).status,
      "inside"
    );
    assert.equal(
      evaluateNutrientTarget({ target: sugarTarget, value: 51 }).status,
      "above"
    );
  });

  it("builds plan targets from macro calories and optional nutrient targets", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Plan)(planInput);

      return {
        energyTarget: getPlanNutrientTarget({
          nutrientName: "energyKcal",
          plan,
        }),
        fiberTarget: getPlanNutrientTarget({
          nutrientName: "fiberGrams",
          plan,
        }),
      };
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.energyTarget?.amount, 2150);
    assert.equal(result.energyTarget?.lowerBound, 1935);
    assert.equal(result.energyTarget?.upperBound, 2365);
    assert.equal(result.fiberTarget?.semantics, "minimum");
    assert.equal(result.fiberTarget?.lowerBound, 30);
    assert.equal(result.fiberTarget?.upperBound, undefined);
  });

  it("detects whether a daily plan is inside all expected nutrient ranges", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Plan)(planInput);

      return {
        insideStatuses: evaluatePlanNutrientTargets({
          plan,
          totals: {
            carbsGrams: 220,
            energyKcal: 2150,
            fatGrams: 70,
            fiberGrams: 30,
            proteinGrams: 160,
            saltGrams: 5,
            saturatedFatGrams: 10,
            sugarGrams: 40,
          },
        }),
        outsideStatuses: evaluatePlanNutrientTargets({
          plan,
          totals: {
            carbsGrams: 220,
            energyKcal: 2150,
            fatGrams: 70,
            fiberGrams: 30,
            proteinGrams: 120,
            saltGrams: 5,
            saturatedFatGrams: 10,
            sugarGrams: 40,
          },
        }),
      };
    });

    const result = await Effect.runPromise(program);

    assert.isTrue(
      isInsideExpectedPlanRange({ statuses: result.insideStatuses })
    );
    assert.isFalse(
      isInsideExpectedPlanRange({ statuses: result.outsideStatuses })
    );
  });

  it("aggregates entries while preserving optional nutrient coverage", async () => {
    const program = Effect.gen(function* () {
      const completeFood = yield* Schema.decodeEffect(Food)(completeFoodInput);
      const partialFood = yield* Schema.decodeEffect(Food)(partialFoodInput);
      const quantityGrams = yield* Schema.decodeEffect(QuantityGrams)(100);

      return calculateEntriesNutrientTotals({
        entries: [
          { food: completeFood, quantityGrams },
          { food: partialFood, quantityGrams },
        ],
      });
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.entriesCount, 2);
    assert.equal(result.totals.energyKcal, 189);
    assert.equal(result.totals.sugarGrams, 3.2);
    assert.equal(result.coverage.energyKcal, 2);
    assert.equal(result.coverage.sugarGrams, 1);
    assert.equal(result.coverage.saltGrams, 1);
  });
});
