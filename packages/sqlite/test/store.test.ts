import {
  ActiveMealPlanSelection,
  Backups,
  DailyLog,
  DefaultFoods,
  Food,
  LocalData,
  MealEntry,
  NutritionStore,
  Plan,
} from "@mai/nutrition";
import { Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import {
  TestSqliteDataLayer,
  TestSqliteNutritionStoreLayer,
} from "../src/layers/test.ts";

const testLayer = Backups.layer.pipe(
  Layer.provideMerge(TestSqliteNutritionStoreLayer)
);

describe("SqliteNutritionStore", () => {
  it("seeds app default foods during initial migration", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* NutritionStore;

        return yield* store.listFoods;
      }).pipe(Effect.provide(testLayer))
    );

    assert.equal(
      result.filter((food) => food.origin === "app-default").length,
      DefaultFoods.length
    );
  });

  it("persists and reads the current nutrition model", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* NutritionStore;
        const plan = yield* testPlan;
        const food = yield* testFood;
        const dailyLog = yield* testDailyLog;
        const selection = yield* testSelection;
        const mealEntry = yield* testMealEntry;

        yield* store.insertPlan(plan);
        yield* store.insertFood(food);
        yield* store.upsertDailyLog(dailyLog);
        yield* store.upsertActiveMealPlanSelection(selection);
        yield* store.insertMealEntry(mealEntry);

        const foods = yield* store.findFoodsByName(food.name);
        const mealEntries = yield* store.findMealEntriesByDate(
          dailyLog.dateKey
        );
        const count = yield* store.countMealEntriesByFood(food.id);

        return {
          count,
          foods,
          mealEntries,
        };
      }).pipe(Effect.provide(testLayer))
    );

    assert.equal(result.count, 1);
    assert.equal(result.foods[0]?.name, "Greek yogurt");
    assert.equal(result.mealEntries[0]?.quantityGrams, 150);
  });

  it("exports and imports shared backups", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* NutritionStore;
        const backups = yield* Backups;
        const plan = yield* testPlan;
        const food = yield* testFood;

        yield* store.insertPlan(plan);
        yield* store.insertFood(food);

        const exported = yield* backups.exportToJson();
        yield* store.replaceStores({
          activeMealPlanSelections: [],
          dailyLogs: [],
          foods: [],
          mealEntries: [],
          plans: [],
        });
        yield* backups.importFromJson({ input: { json: exported.json } });

        return yield* store.readStores;
      }).pipe(Effect.provide(testLayer))
    );

    assert.equal(result.foods.length, DefaultFoods.length + 1);
    assert.equal(result.plans.length, 1);
    assert.isDefined(result.foods.find((food) => food.name === "Greek yogurt"));
  });

  it("resets the sqlite database back to migration-seeded defaults", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* NutritionStore;
        const localData = yield* LocalData;
        const plan = yield* testPlan;
        const food = yield* testFood;

        yield* store.insertPlan(plan);
        yield* store.insertFood(food);
        yield* localData.reset;

        return yield* store.readStores;
      }).pipe(Effect.provide(TestSqliteDataLayer))
    );

    assert.equal(result.activeMealPlanSelections.length, 0);
    assert.equal(result.dailyLogs.length, 0);
    assert.equal(result.mealEntries.length, 0);
    assert.equal(result.plans.length, 0);
    assert.equal(result.foods.length, DefaultFoods.length);
    assert.isUndefined(
      result.foods.find((food) => food.name === "Greek yogurt")
    );
  });
});

const testFood = Schema.decodeEffect(Food)({
  carbsGramsPer100g: 3.6,
  createdAt: 0,
  energyKcalPer100g: 59,
  fatGramsPer100g: 0.4,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  origin: "user",
  proteinGramsPer100g: 10,
  updatedAt: 0,
});

const testPlan = Schema.decodeEffect(Plan)({
  carbsTargetGrams: 220,
  createdAt: 0,
  fatTargetGrams: 70,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  name: "Training day",
  proteinTargetGrams: 160,
});

const testDailyLog = Schema.decodeEffect(DailyLog)({
  createdAt: 0,
  dateKey: "2026-06-20",
  planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  updatedAt: 0,
});

const testSelection = Schema.decodeEffect(ActiveMealPlanSelection)({
  id: "active-meal-plan",
  planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  updatedAt: 0,
});

const testMealEntry = Schema.decodeEffect(MealEntry)({
  createdAt: 0,
  dateKey: "2026-06-20",
  foodId: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
  meal: "breakfast",
  quantityGrams: 150,
  updatedAt: 0,
});
