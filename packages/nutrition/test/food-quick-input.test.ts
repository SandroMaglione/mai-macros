import { Effect } from "effect";
import { assert, describe, it } from "vitest";

import {
  FoodQuickInputParseError,
  parseFoodQuickInput,
} from "../src/food-quick-input.ts";

describe("food quick input parser", () => {
  it("parses a full positional Italian label order", async () => {
    const result = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Yogurt greco 0%, Fage, 59, 0.4, 0.1, 3.6, 3.2, 0, 10, 0.1",
      })
    );

    assert.deepStrictEqual(result, {
      name: "Yogurt greco 0%",
      brand: "Fage",
      energyKcalPer100g: 59,
      fatGramsPer100g: 0.4,
      saturatedFatGramsPer100g: 0.1,
      carbsGramsPer100g: 3.6,
      sugarGramsPer100g: 3.2,
      fiberGramsPer100g: 0,
      proteinGramsPer100g: 10,
      saltGramsPer100g: 0.1,
    });
  });

  it("keeps empty positional slots undefined without turning them into zero", async () => {
    const result = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Tonno al naturale, Rio Mare, 103, 0.8,,0,,,24,0.9",
      })
    );

    assert.deepStrictEqual(result, {
      name: "Tonno al naturale",
      brand: "Rio Mare",
      energyKcalPer100g: 103,
      fatGramsPer100g: 0.8,
      carbsGramsPer100g: 0,
      proteinGramsPer100g: 24,
      saltGramsPer100g: 0.9,
    });
  });

  it("parses positional input without brand and missing optional salt", async () => {
    const result = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Banana,,89,0.3,,23,12,2.6,1.1,",
      })
    );

    assert.deepStrictEqual(result, {
      name: "Banana",
      energyKcalPer100g: 89,
      fatGramsPer100g: 0.3,
      carbsGramsPer100g: 23,
      sugarGramsPer100g: 12,
      fiberGramsPer100g: 2.6,
      proteinGramsPer100g: 1.1,
    });
  });

  it("parses compact tagged input", async () => {
    const result = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Yogurt greco 0%, Fage, k59 f0.4 sf0.1 c3.6 su3.2 fi0 p10 sa0.1",
      })
    );

    assert.deepStrictEqual(result, {
      name: "Yogurt greco 0%",
      brand: "Fage",
      energyKcalPer100g: 59,
      fatGramsPer100g: 0.4,
      saturatedFatGramsPer100g: 0.1,
      carbsGramsPer100g: 3.6,
      sugarGramsPer100g: 3.2,
      fiberGramsPer100g: 0,
      proteinGramsPer100g: 10,
      saltGramsPer100g: 0.1,
    });
  });

  it("parses tagged input with spaces after tags and extra commas", async () => {
    const result = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Skyr bianco, Milbona,   k 63, p 11, c 4, f 0.2",
      })
    );

    assert.deepStrictEqual(result, {
      name: "Skyr bianco",
      brand: "Milbona",
      energyKcalPer100g: 63,
      fatGramsPer100g: 0.2,
      carbsGramsPer100g: 4,
      proteinGramsPer100g: 11,
    });
  });

  it("parses tagged input in any nutrient order", async () => {
    const result = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Pane di segale, Lidl, p8.5 c42 f1.2 k215 fi6.1 sa1.1",
      })
    );

    assert.deepStrictEqual(result, {
      name: "Pane di segale",
      brand: "Lidl",
      energyKcalPer100g: 215,
      fatGramsPer100g: 1.2,
      carbsGramsPer100g: 42,
      fiberGramsPer100g: 6.1,
      proteinGramsPer100g: 8.5,
      saltGramsPer100g: 1.1,
    });
  });

  it("fails when a required tagged nutrient is missing", async () => {
    const error = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Crackers integrali, Misura, k430 f12 c65",
      }).pipe(Effect.flip)
    );

    assert.instanceOf(error, FoodQuickInputParseError);
    assert.equal(error.reason, "missing-required-nutrient");
    assert.equal(error.field, "proteinGramsPer100g");
  });

  it("rejects decimal commas in tagged input", async () => {
    const error = await Effect.runPromise(
      parseFoodQuickInput({
        input: "Biscotti secchi, Oro Saiwa, k425 f10,5 c72 p8",
      }).pipe(Effect.flip)
    );

    assert.instanceOf(error, FoodQuickInputParseError);
    assert.equal(error.reason, "unrecognized-token");
  });
});
