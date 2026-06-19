import { Effect } from "effect";
import { assert, describe, it } from "vitest";

import {
  parseFoodQuickInput,
  type FoodQuickInput,
  type FoodQuickInputFieldName,
  type FoodQuickInputParseIssue,
  type FoodQuickInputParseResult,
} from "../src/food-quick-input.ts";

describe("food quick input parser", () => {
  it("parses a full positional Italian label order", async () => {
    const result = await _parseFoodQuickInput({
      input: "Yogurt greco 0%, Fage, 59, 0.4, 0.1, 3.6, 3.2, 0, 10, 0.1",
    });

    assert.deepStrictEqual(_expectComplete({ result }), {
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
    const result = await _parseFoodQuickInput({
      input: "Tonno al naturale, Rio Mare, 103, 0.8,,0,,,24,0.9",
    });

    assert.deepStrictEqual(_expectComplete({ result }), {
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
    const result = await _parseFoodQuickInput({
      input: "Banana,,89,0.3,,23,12,2.6,1.1,",
    });

    assert.deepStrictEqual(_expectComplete({ result }), {
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
    const result = await _parseFoodQuickInput({
      input: "Yogurt greco 0%, Fage, k59 f0.4 sf0.1 c3.6 su3.2 fi0 p10 sa0.1",
    });

    assert.deepStrictEqual(_expectComplete({ result }), {
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
    const result = await _parseFoodQuickInput({
      input: "Skyr bianco, Milbona,   k 63, p 11, c 4, f 0.2",
    });

    assert.deepStrictEqual(_expectComplete({ result }), {
      name: "Skyr bianco",
      brand: "Milbona",
      energyKcalPer100g: 63,
      fatGramsPer100g: 0.2,
      carbsGramsPer100g: 4,
      proteinGramsPer100g: 11,
    });
  });

  it("parses tagged input in any nutrient order", async () => {
    const result = await _parseFoodQuickInput({
      input: "Pane di segale, Lidl, p8.5 c42 f1.2 k215 fi6.1 sa1.1",
    });

    assert.deepStrictEqual(_expectComplete({ result }), {
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

  it("returns an empty result before the user writes food text", async () => {
    const result = await _parseFoodQuickInput({ input: "   " });

    assert.deepStrictEqual(result, {
      input: "   ",
      issues: [],
      partial: {},
      status: "empty",
    });
  });

  it("returns the name as partial information before nutrients are written", async () => {
    const result = await _parseFoodQuickInput({ input: "Crackers integrali" });

    assert.deepStrictEqual(result.partial, {
      name: "Crackers integrali",
    });
    assert.equal(result.status, "incomplete");
    assert.deepStrictEqual(_issueReasons({ issues: result.issues }), [
      "missing-required-nutrient",
      "missing-required-nutrient",
      "missing-required-nutrient",
      "missing-required-nutrient",
    ]);
    assert.deepStrictEqual(_issueFields({ issues: result.issues }), [
      "energyKcalPer100g",
      "fatGramsPer100g",
      "carbsGramsPer100g",
      "proteinGramsPer100g",
    ]);
  });

  it("keeps positional values visible while the user skips brand and types through commas", async () => {
    const cases = [
      {
        input: "Banana,,89",
        partial: {
          name: "Banana",
          energyKcalPer100g: 89,
        },
        missingFields: [
          "fatGramsPer100g",
          "carbsGramsPer100g",
          "proteinGramsPer100g",
        ],
      },
      {
        input: "Banana,,89,",
        partial: {
          name: "Banana",
          energyKcalPer100g: 89,
        },
        missingFields: [
          "fatGramsPer100g",
          "carbsGramsPer100g",
          "proteinGramsPer100g",
        ],
      },
      {
        input: "Banana,,89,0.3,",
        partial: {
          name: "Banana",
          energyKcalPer100g: 89,
          fatGramsPer100g: 0.3,
        },
        missingFields: ["carbsGramsPer100g", "proteinGramsPer100g"],
      },
      {
        input: "Banana,,89,0.3,,23,",
        partial: {
          name: "Banana",
          energyKcalPer100g: 89,
          fatGramsPer100g: 0.3,
          carbsGramsPer100g: 23,
        },
        missingFields: ["proteinGramsPer100g"],
      },
    ] satisfies readonly {
      readonly input: string;
      readonly missingFields: readonly (FoodQuickInputFieldName | undefined)[];
      readonly partial: Record<string, number | string>;
    }[];

    for (const testCase of cases) {
      const result = await _parseFoodQuickInput({ input: testCase.input });

      assert.equal(result.status, "incomplete");
      assert.deepStrictEqual(result.partial, testCase.partial);
      assert.deepStrictEqual(
        _issueFields({ issues: result.issues }),
        testCase.missingFields
      );
    }
  });

  it("returns tagged partial information with missing required nutrients as issues", async () => {
    const result = await _parseFoodQuickInput({
      input: "Crackers integrali, Misura, k430 f12 c65",
    });

    assert.equal(result.status, "incomplete");
    assert.deepStrictEqual(result.partial, {
      name: "Crackers integrali",
      brand: "Misura",
      energyKcalPer100g: 430,
      fatGramsPer100g: 12,
      carbsGramsPer100g: 65,
    });
    assert.deepStrictEqual(_issueFields({ issues: result.issues }), [
      "proteinGramsPer100g",
    ]);
  });

  it("keeps later positional fields when an earlier nutrient number is invalid", async () => {
    const result = await _parseFoodQuickInput({
      input: "Banana,,89,not-a-number,,23",
    });

    assert.equal(result.status, "invalid");
    assert.deepStrictEqual(result.partial, {
      name: "Banana",
      energyKcalPer100g: 89,
      carbsGramsPer100g: 23,
    });
    assert.deepStrictEqual(_issueReasons({ issues: result.issues }), [
      "invalid-number",
      "missing-required-nutrient",
    ]);
    assert.deepStrictEqual(_issueFields({ issues: result.issues }), [
      "fatGramsPer100g",
      "proteinGramsPer100g",
    ]);
  });

  it("keeps the first tagged value and reports duplicate tags as issues", async () => {
    const result = await _parseFoodQuickInput({
      input: "Skyr bianco, Milbona, k63 f0.2 c4 p11 p12",
    });

    assert.equal(result.status, "invalid");
    assert.deepStrictEqual(result.partial, {
      name: "Skyr bianco",
      brand: "Milbona",
      energyKcalPer100g: 63,
      fatGramsPer100g: 0.2,
      carbsGramsPer100g: 4,
      proteinGramsPer100g: 11,
    });
    assert.deepStrictEqual(result.issues, [
      {
        field: "proteinGramsPer100g",
        input: "Skyr bianco, Milbona, k63 f0.2 c4 p11 p12",
        message: "Food quick input repeats the p nutrient tag.",
        reason: "duplicate-tag",
      },
    ]);
  });

  it("rejects decimal commas in tagged input while preserving parsed values", async () => {
    const result = await _parseFoodQuickInput({
      input: "Biscotti secchi, Oro Saiwa, k425 f10,5 c72 p8",
    });

    assert.equal(result.status, "invalid");
    assert.deepStrictEqual(result.partial, {
      name: "Biscotti secchi",
      brand: "Oro Saiwa",
      energyKcalPer100g: 425,
      fatGramsPer100g: 10,
      carbsGramsPer100g: 72,
      proteinGramsPer100g: 8,
    });
    assert.deepStrictEqual(_issueReasons({ issues: result.issues }), [
      "unrecognized-token",
    ]);
  });

  it("reports too many positional fields while keeping the first nutrient fields", async () => {
    const result = await _parseFoodQuickInput({
      input: "Yogurt greco 0%, Fage, 59, 0.4, 0.1, 3.6, 3.2, 0, 10, 0.1, 4",
    });

    assert.equal(result.status, "invalid");
    assert.deepStrictEqual(result.partial, {
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
    assert.deepStrictEqual(result.issues, [
      {
        input: "Yogurt greco 0%, Fage, 59, 0.4, 0.1, 3.6, 3.2, 0, 10, 0.1, 4",
        message: "Food quick input has too many positional nutrient fields.",
        reason: "too-many-fields",
      },
    ]);
  });
});

function _parseFoodQuickInput({
  input,
}: {
  readonly input: string;
}): Promise<FoodQuickInputParseResult> {
  return Effect.runPromise(parseFoodQuickInput({ input }));
}

function _expectComplete({
  result,
}: {
  readonly result: FoodQuickInputParseResult;
}): FoodQuickInput {
  if (result.status !== "complete") {
    assert.fail(`Expected complete parse result, got ${result.status}.`);
  }

  assert.deepStrictEqual(result.issues, []);

  return result.food;
}

function _issueFields({
  issues,
}: {
  readonly issues: readonly FoodQuickInputParseIssue[];
}) {
  return issues.map((issue) => issue.field);
}

function _issueReasons({
  issues,
}: {
  readonly issues: readonly FoodQuickInputParseIssue[];
}) {
  return issues.map((issue) => issue.reason);
}
