import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, Reporting } from "../src/index.ts";

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

const completeFoodInput: typeof Domain.Food.Encoded = {
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

const partialFoodInput: typeof Domain.Food.Encoded = {
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
    assert.equal(
      Reporting.NutrientTargetSemanticsByName.proteinGrams,
      "minimum"
    );
    assert.equal(Reporting.NutrientTargetSemanticsByName.fiberGrams, "minimum");
    assert.equal(Reporting.NutrientTargetSemanticsByName.sugarGrams, "maximum");
    assert.equal(Reporting.NutrientTargetSemanticsByName.saltGrams, "maximum");
    assert.equal(
      Reporting.NutrientTargetSemanticsByName.saturatedFatGrams,
      "maximum"
    );
    assert.equal(Reporting.NutrientTargetSemanticsByName.energyKcal, "range");
    assert.equal(Reporting.NutrientTargetSemanticsByName.carbsGrams, "range");
    assert.equal(Reporting.NutrientTargetSemanticsByName.fatGrams, "range");
  });

  it("evaluates range targets with the default tolerance", () => {
    const target = Reporting.makeNutrientTarget({
      amount: 2000,
      nutrientName: "energyKcal",
    });

    assert.equal(
      Reporting.evaluateNutrientTarget({ target, value: 1800 }).status,
      "inside"
    );
    assert.equal(
      Reporting.evaluateNutrientTarget({ target, value: 2200 }).status,
      "inside"
    );
    assert.equal(
      Reporting.evaluateNutrientTarget({ target, value: 1799 }).status,
      "below"
    );
    assert.equal(
      Reporting.evaluateNutrientTarget({ target, value: 2201 }).status,
      "above"
    );
  });

  it("evaluates minimum and maximum targets with directional semantics", () => {
    const proteinTarget = Reporting.makeNutrientTarget({
      amount: 160,
      nutrientName: "proteinGrams",
    });
    const sugarTarget = Reporting.makeNutrientTarget({
      amount: 50,
      nutrientName: "sugarGrams",
    });

    assert.equal(
      Reporting.evaluateNutrientTarget({ target: proteinTarget, value: 159 })
        .status,
      "below"
    );
    assert.equal(
      Reporting.evaluateNutrientTarget({ target: proteinTarget, value: 170 })
        .status,
      "inside"
    );
    assert.equal(
      Reporting.evaluateNutrientTarget({ target: sugarTarget, value: 49 })
        .status,
      "inside"
    );
    assert.equal(
      Reporting.evaluateNutrientTarget({ target: sugarTarget, value: 51 })
        .status,
      "above"
    );
  });

  it("builds plan targets from macro calories and optional nutrient targets", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);

      return {
        energyTarget: Reporting.getPlanNutrientTarget({
          nutrientName: "energyKcal",
          plan,
        }),
        fiberTarget: Reporting.getPlanNutrientTarget({
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
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);

      return {
        insideStatuses: Reporting.evaluatePlanNutrientTargets({
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
        outsideStatuses: Reporting.evaluatePlanNutrientTargets({
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
      Reporting.isInsideExpectedPlanRange({ statuses: result.insideStatuses })
    );
    assert.isFalse(
      Reporting.isInsideExpectedPlanRange({ statuses: result.outsideStatuses })
    );
  });

  it("aggregates entries while preserving optional nutrient coverage", async () => {
    const program = Effect.gen(function* () {
      const completeFood = yield* Schema.decodeEffect(Domain.Food)(
        completeFoodInput
      );
      const partialFood = yield* Schema.decodeEffect(Domain.Food)(
        partialFoodInput
      );
      const quantityGrams = yield* Schema.decodeEffect(Domain.QuantityGrams)(
        100
      );

      return Reporting.calculateEntriesNutrientTotals({
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

  it("aggregates entry weight and density ratios", async () => {
    const program = Effect.gen(function* () {
      const firstQuantity = yield* Schema.decodeEffect(Domain.QuantityGrams)(
        100
      );
      const secondQuantity = yield* Schema.decodeEffect(Domain.QuantityGrams)(
        250
      );

      return Reporting.calculateEntriesWeightTotals({
        entries: [
          { quantityGrams: firstQuantity },
          { quantityGrams: secondQuantity },
        ],
      });
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.entriesCount, 2);
    assert.equal(result.quantityGrams, 350);
    assert.equal(
      Reporting.calculateCaloriesPerGram({
        energyKcal: 700,
        quantityGrams: result.quantityGrams,
      }),
      2
    );
    assert.equal(
      Reporting.calculateGramsPerCalorie({
        energyKcal: 700,
        quantityGrams: result.quantityGrams,
      }),
      0.5
    );
    assert.equal(
      Reporting.calculateGramsPerCalorie({
        energyKcal: 0,
        quantityGrams: result.quantityGrams,
      }),
      null
    );
  });
});
