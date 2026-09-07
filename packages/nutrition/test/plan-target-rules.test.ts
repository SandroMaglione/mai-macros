import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";
import { Domain, Reporting } from "../src/index.ts";

const planInput = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Targets",
  proteinTargetGrams: 100,
  carbsTargetGrams: 200,
  fatTargetGrams: 60,
  fiberTargetGrams: 30,
  saturatedFatTargetGrams: 20,
  createdAt: 0,
  meals: [{ id: "lunch", name: "Lunch", position: 0, createdAt: 0 }],
};

describe("plan target rules", () => {
  it("defaults old plans and honors each saved override", async () => {
    const { legacy, custom } = await Effect.runPromise(
      Effect.gen(function* () {
        const legacy = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const custom = yield* Schema.decodeEffect(Domain.Plan)({
          ...planInput,
          targetRules: {
            ...Domain.DefaultPlanTargetRules,
            energyKcal: "maximum",
            proteinGrams: "maximum",
            fiberGrams: "maximum",
            saturatedFatGrams: "minimum",
          },
        });
        return { legacy, custom };
      })
    );
    assert.deepEqual(legacy.targetRules, Domain.DefaultPlanTargetRules);
    for (const name of Reporting.NutrientNames) {
      const target = Reporting.getPlanNutrientTarget({
        nutrientName: name,
        plan: custom,
      });
      if (target !== undefined)
        assert.equal(target.semantics, custom.targetRules[name]);
    }
    assert.equal(
      Reporting.getPlanNutrientTarget({
        nutrientName: "sugarGrams",
        plan: custom,
      }),
      undefined
    );
  });

  it("treats minimums as fulfilled above the target and limits as fulfilled below it", () => {
    const minimum = Reporting.makeNutrientTarget({
      amount: 30,
      nutrientName: "fiberGrams",
    });
    const maximum = Reporting.makeNutrientTarget({
      amount: 20,
      nutrientName: "saturatedFatGrams",
    });
    for (const [value, status] of [
      [29.9, "below"],
      [30, "inside"],
      [33, "inside"],
      [33.01, "above"],
    ] as const) {
      assert.equal(
        Reporting.evaluateNutrientTarget({ target: minimum, value }).status,
        status
      );
    }
    for (const [value, status] of [
      [0, "inside"],
      [19, "inside"],
      [20, "inside"],
      [20.01, "above"],
    ] as const) {
      assert.equal(
        Reporting.evaluateNutrientTarget({ target: maximum, value }).status,
        status
      );
    }
    assert.equal(
      Reporting.remainingNutrientTargetAmount({ target: minimum, value: 45 }),
      -15
    );
    assert.equal(
      Reporting.remainingNutrientTargetAmount({ target: minimum, value: 25 }),
      5
    );
    assert.equal(
      Reporting.remainingNutrientTargetAmount({ target: maximum, value: 15 }),
      5
    );
    assert.equal(
      Reporting.remainingNutrientTargetAmount({ target: maximum, value: 25 }),
      -5
    );
  });

  it("uses the minimum overage tolerance and supports explicit zero limits", () => {
    const target = Reporting.makeNutrientTarget({
      amount: 100,
      nutrientName: "proteinGrams",
      semantics: "minimum",
    });
    for (const [value, status] of [
      [89.9, "below"],
      [90, "below"],
      [100, "inside"],
      [110, "inside"],
      [110.01, "above"],
    ] as const) {
      assert.equal(
        Reporting.evaluateNutrientTarget({ target, value }).status,
        status
      );
    }
    const zero = Reporting.makeNutrientTarget({
      amount: 0,
      nutrientName: "sugarGrams",
    });
    assert.equal(
      Reporting.evaluateNutrientTarget({ target: zero, value: 0 }).status,
      "inside"
    );
    assert.equal(
      Reporting.evaluateNutrientTarget({ target: zero, value: 0.1 }).status,
      "above"
    );
  });
});
