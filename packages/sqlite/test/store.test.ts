import {
  Backup,
  DefaultFoods,
  Domain,
  LocalData as NutritionLocalData,
  Migrations,
  Store,
} from "@mai/nutrition";
import { Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { assert, describe, it } from "vitest";

import migration001 from "../src/migrations/001-initial.ts";
import migration002 from "../src/migrations/002-custom-plan-meals.ts";
import {
  TestSqliteClientLayer,
  TestSqliteDataLayer,
  TestSqliteNutritionStoreLayer,
} from "./sqlite-test-layers.ts";

const CustomPlanMealsMigration = Migrations.Version004CustomPlanMeals;

const testLayer = Backup.Backups.layer.pipe(
  Layer.provideMerge(TestSqliteNutritionStoreLayer)
);

describe("SqliteNutritionStore", () => {
  it("seeds app default foods during initial migration", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.NutritionStore;

        return yield* store.listFoods;
      }).pipe(Effect.provide(testLayer))
    );

    assert.equal(
      result.filter((food) => food.origin === "app-default").length,
      DefaultFoods.DefaultFoods.length
    );
  });

  it("persists and reads the current nutrition model", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
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
    assert.isDefined(
      result.foods.find(
        (food) =>
          food.id === "9535a059-a61f-42e1-a2e0-35ec87203c24" &&
          food.origin === "import"
      )
    );
    assert.equal(result.mealEntries[0]?.quantityGrams, 150);
  });

  it("removes stale plan meals when a plan is updated in place", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const plan = yield* testPlanWithRemovedMeal;

        yield* store.insertPlan(yield* testPlanWithExtraMeal);
        yield* store.upsertPlans([plan]);

        return yield* store.findPlanById(plan.id);
      }).pipe(Effect.provide(testLayer))
    );

    assert.deepStrictEqual(
      result[0]?.meals.map((meal) => ({
        id: meal.id,
        name: meal.name,
        position: meal.position,
      })),
      [
        {
          id: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
          name: "Early breakfast",
          position: 0,
        },
      ]
    );
  });

  it("deletes daily logs by date key", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const plan = yield* testPlan;
        const dailyLog = yield* testDailyLog;

        yield* store.insertPlan(plan);
        yield* store.upsertDailyLog(dailyLog);
        yield* store.deleteDailyLog(dailyLog.dateKey);

        return yield* store.findDailyLogByDateKey(dailyLog.dateKey);
      }).pipe(Effect.provide(testLayer))
    );

    assert.equal(result.length, 0);
  });

  it("migrates legacy meal entries to deterministic plan meals", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const findDailyLogs = SqlSchema.findAll({
          Request: Schema.Struct({}),
          Result: Schema.Struct({
            createdAt: Schema.Number,
            dateKey: Schema.String,
            planId: Schema.String,
            updatedAt: Schema.Number,
          }),
          execute: () =>
            sql`
              SELECT
                created_at AS createdAt,
                date_key AS dateKey,
                plan_id AS planId,
                updated_at AS updatedAt
              FROM daily_logs
              WHERE date_key = '2026-06-21'
            `,
        });
        const findMealEntries = SqlSchema.findAll({
          Request: Schema.Struct({}),
          Result: Schema.Struct({
            id: Schema.String,
            mealId: Schema.String,
            quantityGrams: Schema.Number,
          }),
          execute: () =>
            sql`
              SELECT
                id,
                meal_id AS mealId,
                quantity_grams AS quantityGrams
              FROM meal_entries
              ORDER BY id
            `,
        });
        const findPlanMeals = SqlSchema.findAll({
          Request: Schema.Struct({}),
          Result: Schema.Struct({
            id: Schema.String,
            name: Schema.String,
            position: Schema.Number,
          }),
          execute: () =>
            sql`
              SELECT id, name, position
              FROM plan_meals
              WHERE plan_id = '9535a059-a61f-42e1-a2e0-35ec87203c25'
              ORDER BY position
            `,
        });

        yield* migration001;
        yield* sql`
          INSERT INTO foods ${sql.insert({
            carbs_grams_per_100g: 3.6,
            created_at: 0,
            energy_kcal_per_100g: 59,
            fat_grams_per_100g: 0.4,
            id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
            name: "Greek yogurt",
            origin: "user",
            protein_grams_per_100g: 10,
            updated_at: 0,
          })}
        `;
        yield* sql`
          INSERT INTO plans ${sql.insert({
            carbs_target_grams: 220,
            created_at: 100,
            fat_target_grams: 70,
            id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
            name: "Training day",
            protein_target_grams: 160,
          })}
        `;
        yield* sql`
          INSERT INTO active_meal_plan_selections ${sql.insert({
            id: "active-meal-plan",
            plan_id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
            updated_at: 150,
          })}
        `;
        yield* sql`
          INSERT INTO meal_entries ${sql.insert({
            created_at: 200,
            date_key: "2026-06-21",
            food_id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
            id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
            meal: "dinner",
            quantity_grams: 150,
            updated_at: 300,
          })}
        `;

        yield* migration002;

        return {
          dailyLogs: yield* findDailyLogs({}),
          mealEntries: yield* findMealEntries({}),
          planMeals: yield* findPlanMeals({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepStrictEqual(result.planMeals, [
      {
        id: CustomPlanMealsMigration.makeMigratedMealId({
          meal: "breakfast",
          planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
        }),
        name: "Breakfast",
        position: 0,
      },
      {
        id: CustomPlanMealsMigration.makeMigratedMealId({
          meal: "lunch",
          planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
        }),
        name: "Lunch",
        position: 1,
      },
      {
        id: CustomPlanMealsMigration.makeMigratedMealId({
          meal: "dinner",
          planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
        }),
        name: "Dinner",
        position: 2,
      },
    ]);
    assert.deepStrictEqual(result.dailyLogs, [
      {
        createdAt: 200,
        dateKey: "2026-06-21",
        planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
        updatedAt: 300,
      },
    ]);
    assert.deepStrictEqual(result.mealEntries, [
      {
        id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
        mealId: CustomPlanMealsMigration.makeMigratedMealId({
          meal: "dinner",
          planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
        }),
        quantityGrams: 150,
      },
    ]);
  });

  it("exports and imports shared backups", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const backups = yield* Backup.Backups;
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

    assert.equal(result.foods.length, DefaultFoods.DefaultFoods.length + 1);
    assert.equal(result.plans.length, 1);
    assert.isDefined(
      result.foods.find(
        (food) => food.id === "9535a059-a61f-42e1-a2e0-35ec87203c24"
      )
    );
  });

  it("resets the sqlite database back to migration-seeded defaults", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const localData = yield* NutritionLocalData.LocalData;
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
    assert.equal(result.foods.length, DefaultFoods.DefaultFoods.length);
    assert.isUndefined(
      result.foods.find(
        (food) => food.id === "9535a059-a61f-42e1-a2e0-35ec87203c24"
      )
    );
  });
});

const testFood = Schema.decodeEffect(Domain.Food)({
  carbsGramsPer100g: 3.6,
  createdAt: 0,
  energyKcalPer100g: 59,
  fatGramsPer100g: 0.4,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  origin: "import",
  proteinGramsPer100g: 10,
  updatedAt: 0,
});

const testPlan = Schema.decodeEffect(Domain.Plan)({
  carbsTargetGrams: 220,
  createdAt: 0,
  fatTargetGrams: 70,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  meals: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
      name: "Breakfast",
      position: 0,
      createdAt: 0,
    },
  ],
  name: "Training day",
  proteinTargetGrams: 160,
});

const testPlanWithExtraMeal = Schema.decodeEffect(Domain.Plan)({
  carbsTargetGrams: 220,
  createdAt: 0,
  fatTargetGrams: 70,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  meals: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
      name: "Breakfast",
      position: 0,
      createdAt: 0,
    },
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:lunch",
      name: "Lunch",
      position: 1,
      createdAt: 0,
    },
  ],
  name: "Training day",
  proteinTargetGrams: 160,
});

const testPlanWithRemovedMeal = Schema.decodeEffect(Domain.Plan)({
  carbsTargetGrams: 220,
  createdAt: 0,
  fatTargetGrams: 70,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  meals: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
      name: "Early breakfast",
      position: 0,
      createdAt: 0,
    },
  ],
  name: "Training day",
  proteinTargetGrams: 160,
});

const testDailyLog = Schema.decodeEffect(Domain.DailyLog)({
  createdAt: 0,
  dateKey: "2026-06-20",
  planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  updatedAt: 0,
});

const testSelection = Schema.decodeEffect(Domain.ActiveMealPlanSelection)({
  id: "active-meal-plan",
  planId: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  updatedAt: 0,
});

const testMealEntry = Schema.decodeEffect(Domain.MealEntry)({
  createdAt: 0,
  dateKey: "2026-06-20",
  foodId: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
  mealId: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
  quantityGrams: 150,
  updatedAt: 0,
});
