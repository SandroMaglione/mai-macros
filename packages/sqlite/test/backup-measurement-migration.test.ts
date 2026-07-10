import { Backup, Store } from "@mai/nutrition";
import { Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { TestSqliteNutritionStoreLayer } from "./sqlite-test-layers.ts";

const backupTestLayer = Backup.Backups.layer.pipe(
  Layer.provideMerge(TestSqliteNutritionStoreLayer)
);

describe("food measurement backup migration", () => {
  it("imports every version 5 value into the measurement model", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const backups = yield* Backup.Backups;
        const store = yield* Store.NutritionStore;
        const legacyBackup = {
          format: "mai.backup",
          formatVersion: 1,
          integrity: {
            counts: {
              activeMealPlanSelections: 1,
              bodyWeightEntries: 1,
              dailyLogs: 1,
              foods: 1,
              mealEntries: 1,
              plans: 1,
            },
          },
          source: {
            databaseName: "mai",
            databaseVersion: 5,
            exportedAt: 100,
          },
          stores: {
            activeMealPlanSelections: [
              {
                id: "active-meal-plan",
                planId: "22222222-2222-4222-8222-222222222222",
                updatedAt: 90,
              },
            ],
            bodyWeightEntries: [
              {
                createdAt: 80,
                dateKey: "2026-07-01",
                updatedAt: 81,
                weightKilograms: 82.4,
              },
            ],
            dailyLogs: [
              {
                createdAt: 60,
                dateKey: "2026-07-01",
                planId: "22222222-2222-4222-8222-222222222222",
                updatedAt: 61,
              },
            ],
            foods: [
              {
                brand: "Legacy brand",
                carbsGramsPer100g: 3.6,
                category: "dairy-egg",
                createdAt: 10,
                energyKcalPer100g: 59,
                fatGramsPer100g: 0.4,
                fiberGramsPer100g: 0,
                id: "11111111-1111-4111-8111-111111111111",
                name: "Legacy yogurt",
                origin: "user",
                proteinGramsPer100g: 10,
                saltGramsPer100g: 0.1,
                saturatedFatGramsPer100g: 0.1,
                sugarGramsPer100g: 3.2,
                updatedAt: 20,
              },
            ],
            mealEntries: [
              {
                createdAt: 70,
                dateKey: "2026-07-01",
                foodId: "11111111-1111-4111-8111-111111111111",
                id: "33333333-3333-4333-8333-333333333333",
                mealId: "22222222-2222-4222-8222-222222222222:breakfast",
                quantityGrams: 150,
                updatedAt: 71,
              },
            ],
            plans: [
              {
                carbsTargetGrams: 220,
                createdAt: 30,
                fatTargetGrams: 70,
                fiberTargetGrams: 30,
                id: "22222222-2222-4222-8222-222222222222",
                meals: [
                  {
                    createdAt: 40,
                    id: "22222222-2222-4222-8222-222222222222:breakfast",
                    name: "Breakfast",
                    position: 0,
                  },
                ],
                name: "Released plan",
                proteinTargetGrams: 160,
                saltTargetGrams: 5,
                saturatedFatTargetGrams: 20,
                sugarTargetGrams: 40,
              },
            ],
          },
        };

        const json = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown)
        )(legacyBackup);

        yield* backups.importFromJson({ input: { json } });

        return yield* store.readStores;
      }).pipe(Effect.provide(backupTestLayer))
    );

    assert.equal(result.foods.length, 1);
    const food = result.foods[0];
    assert.isDefined(food);
    assert.equal(food.name, "Legacy yogurt");
    assert.equal(food.energyKcal, 59);
    assert.equal(food.proteinGrams, 10);
    assert.equal(food.carbsGrams, 3.6);
    assert.equal(food.fatGrams, 0.4);
    assert.equal(food.fiberGrams, 0);
    assert.equal(food.sugarGrams, 3.2);
    assert.equal(food.saturatedFatGrams, 0.1);
    assert.equal(food.saltGrams, 0.1);
    assert.equal(food.nutritionReference.amount, 100);
    assert.equal(food.nutritionReference.unit, "g");
    assert.deepStrictEqual(food.portions, []);
    assert.isUndefined(food.massVolumeConversion);

    assert.equal(result.mealEntries.length, 1);
    const mealEntry = result.mealEntries[0];
    assert.isDefined(mealEntry);
    assert.equal(mealEntry.quantity._tag, "MeasuredFoodQuantity");
    if (mealEntry.quantity._tag === "MeasuredFoodQuantity") {
      assert.equal(mealEntry.quantity.amount, 150);
      assert.equal(mealEntry.quantity.unit, "g");
    }
    assert.equal(mealEntry.nutritionMultiplier, 1.5);
    assert.equal(result.bodyWeightEntries[0]?.weightKilograms, 82.4);
    assert.equal(result.dailyLogs[0]?.planId, result.plans[0]?.id);
    assert.equal(result.mealEntries[0]?.mealId, result.plans[0]?.meals[0]?.id);
  });
});
