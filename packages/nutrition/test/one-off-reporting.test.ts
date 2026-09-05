import { Effect, Exit, Schema } from "effect";
import { assert, describe, it } from "vitest";
import { Domain, Reporting } from "../src/index.ts";

const unknown = { _tag: "Unknown" } as const;
const nutrients = {
  energyKcal: { _tag: "Estimated", value: 700 },
  proteinGrams: { _tag: "Estimated", value: 30 },
  carbsGrams: unknown,
  fatGrams: unknown,
  fiberGrams: unknown,
  sugarGrams: unknown,
  saturatedFatGrams: unknown,
  saltGrams: { _tag: "Recorded", value: 0 },
} satisfies Domain.OneOffNutrients;
const oneOffInput = {
  kind: "one-off",
  id: "11111111-1111-4111-8111-111111111111",
  dateKey: "2026-09-05",
  mealId: "lunch",
  createdAt: 1,
  updatedAt: 2,
  name: "Noodle bowl",
  amountDescription: "Half a bowl",
  note: "Restaurant estimate",
  nutrients,
} satisfies typeof Domain.OneOffMealEntry.Encoded;

describe("one-off nutrition reporting", () => {
  it("keeps recorded, estimated, unknown and explicit zero contributions distinct", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)({
          id: "22222222-2222-4222-8222-222222222222",
          name: "Complete food",
          origin: "user",
          energyKcal: 900,
          proteinGrams: 60,
          carbsGrams: 100,
          fatGrams: 30,
          fiberGrams: 10,
          sugarGrams: 5,
          saturatedFatGrams: 3,
          saltGrams: 1,
          createdAt: 1,
          updatedAt: 1,
        });
        const catalog = yield* Schema.decodeEffect(Domain.CatalogMealEntry)({
          id: "33333333-3333-4333-8333-333333333333",
          dateKey: "2026-09-05",
          mealId: "lunch",
          foodId: food.id,
          quantity: { _tag: "MeasuredFoodQuantity", amount: 100, unit: "g" },
          nutritionMultiplier: 1,
          createdAt: 1,
          updatedAt: 1,
        });
        const oneOff = yield* Schema.decodeEffect(Domain.OneOffMealEntry)(
          oneOffInput
        );
        return {
          catalog,
          total: Reporting.calculateMealEntriesNutrientTotals({
            foods: [food],
            mealEntries: [catalog, oneOff],
          }),
          weight: Reporting.calculateMealEntriesWeightTotals({
            foods: [food],
            mealEntries: [catalog, oneOff],
          }),
          cost: Reporting.calculateMealEntriesCostTotals({
            foods: [food],
            mealEntries: [catalog, oneOff],
          }),
        };
      })
    );
    assert.equal(result.catalog.quantityAccuracy, "unspecified");
    assert.equal(result.total.recorded.energyKcal, 900);
    assert.equal(result.total.estimated.energyKcal, 700);
    assert.equal(result.total.totals.energyKcal, 1600);
    assert.equal(result.total.recorded.proteinGrams, 60);
    assert.equal(result.total.estimated.proteinGrams, 30);
    assert.equal(result.total.totals.carbsGrams, 100);
    assert.equal(result.total.missing.carbsGrams, 1);
    assert.equal(result.total.coverage.saltGrams, 2);
    assert.equal(result.total.missing.saltGrams, 0);
    assert.equal(result.weight.quantityGrams, 100);
    assert.equal(result.weight.resolvedEntriesCount, 1);
    assert.equal(result.weight.entriesCount, 2);
    assert.equal(result.cost.entriesCount, 2);
    assert.equal(result.cost.resolvedEntriesCount, 0);
  });

  it("supports a name-only entry without inventing any nutrient or weight", async () => {
    const entry = await Effect.runPromise(
      Schema.decodeEffect(Domain.OneOffMealEntry)({
        ...oneOffInput,
        nutrients: {
          energyKcal: unknown,
          proteinGrams: unknown,
          carbsGrams: unknown,
          fatGrams: unknown,
          fiberGrams: unknown,
          sugarGrams: unknown,
          saturatedFatGrams: unknown,
          saltGrams: unknown,
        },
      })
    );
    const result = Reporting.calculateMealEntriesNutrientTotals({
      foods: [],
      mealEntries: [entry],
    });
    assert.deepEqual(result.coverage, Reporting.emptyNutrientCoverage());
    assert.deepEqual(Object.values(result.missing), [1, 1, 1, 1, 1, 1, 1, 1]);
    assert.equal(result.entriesCount, 1);
  });

  it("propagates estimated quantity to each known catalog nutrient", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)({
          id: "22222222-2222-4222-8222-222222222222",
          name: "Rice",
          origin: "user",
          energyKcal: 100,
          proteinGrams: 3,
          carbsGrams: 20,
          fatGrams: 0,
          createdAt: 1,
          updatedAt: 1,
        });
        const entry = yield* Schema.decodeEffect(Domain.CatalogMealEntry)({
          id: "33333333-3333-4333-8333-333333333333",
          dateKey: "2026-09-05",
          mealId: "lunch",
          foodId: food.id,
          quantity: { _tag: "MeasuredFoodQuantity", amount: 200, unit: "g" },
          quantityAccuracy: "estimated",
          nutritionMultiplier: 2,
          createdAt: 1,
          updatedAt: 1,
        });
        return Reporting.calculateMealEntriesNutrientTotals({
          foods: [food],
          mealEntries: [entry],
        });
      })
    );
    assert.equal(result.recorded.energyKcal, 0);
    assert.equal(result.estimated.energyKcal, 200);
    assert.equal(result.estimatedCoverage.fatGrams, 1);
    assert.equal(result.missing.fiberGrams, 1);
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects invalid nutrition %s",
    async (value) => {
      const result = await Effect.runPromise(
        Effect.exit(
          Schema.decodeEffect(Domain.OneOffMealEntry)({
            ...oneOffInput,
            nutrients: {
              ...nutrients,
              energyKcal: { _tag: "Estimated", value },
            },
          })
        )
      );
      assert(Exit.isFailure(result));
    }
  );
});
