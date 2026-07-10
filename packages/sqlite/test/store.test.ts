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
import migration003 from "../src/migrations/003-body-weight-entries.ts";
import migration004 from "../src/migrations/004-food-measurements.ts";
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
        yield* store.upsertBodyWeightEntry(yield* testBodyWeightEntry);

        const foods = yield* store.findFoodsByName(food.name);
        const mealEntries = yield* store.findMealEntriesByDate(
          dailyLog.dateKey
        );
        const bodyWeightEntries = yield* store.findBodyWeightEntriesByRange({
          endDateKey: dailyLog.dateKey,
          startDateKey: dailyLog.dateKey,
        });
        const count = yield* store.countMealEntriesByFood(food.id);

        return {
          bodyWeightEntries,
          count,
          foods,
          mealEntries,
        };
      }).pipe(Effect.provide(testLayer))
    );

    assert.equal(result.bodyWeightEntries[0]?.weightKilograms, 82.4);
    assert.equal(result.count, 1);
    const persistedFood = result.foods.find(
      (food) =>
        food.id === "9535a059-a61f-42e1-a2e0-35ec87203c24" &&
        food.origin === "import"
    );
    assert.isDefined(persistedFood);
    assert.equal(persistedFood.nutritionReference.amount, 100);
    assert.equal(persistedFood.nutritionReference.unit, "ml");
    assert.equal(persistedFood.portions[0]?.name, "X");
    assert.equal(persistedFood.portions[0]?.size.amount, 250);
    assert.equal(persistedFood.massVolumeConversion?.mass.amount, 103);
    assert.equal(
      result.mealEntries[0]?.quantity._tag === "MeasuredFoodQuantity"
        ? result.mealEntries[0].quantity.amount
        : undefined,
      150
    );
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

  it("migrates legacy gram entries and food references without losing data", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const findMealEntries = SqlSchema.findAll({
          Request: Schema.Struct({}),
          Result: Schema.Struct({
            id: Schema.String,
            nutritionMultiplier: Schema.Number,
            quantityAmount: Schema.Number,
            quantityKind: Schema.String,
            quantityUnit: Schema.NullOr(Schema.String),
          }),
          execute: () =>
            sql`
              SELECT
                id,
                nutrition_multiplier AS nutritionMultiplier,
                quantity_amount AS quantityAmount,
                quantity_kind AS quantityKind,
                quantity_unit AS quantityUnit
              FROM meal_entries
              ORDER BY id
            `,
        });
        const findFoods = SqlSchema.findAll({
          Request: Schema.Struct({}),
          Result: Schema.Struct({
            id: Schema.String,
            referenceAmount: Schema.Number,
            referenceUnit: Schema.String,
          }),
          execute: () =>
            sql`
              SELECT
                id,
                nutrition_reference_amount AS referenceAmount,
                nutrition_reference_unit AS referenceUnit
              FROM foods
              WHERE id = '9535a059-a61f-42e1-a2e0-35ec87203c24'
            `,
        });
        const findBodyWeightEntries = SqlSchema.findAll({
          Request: Schema.Struct({}),
          Result: Schema.Struct({
            dateKey: Schema.String,
            weightKilograms: Schema.Number,
          }),
          execute: () =>
            sql`
              SELECT
                date_key AS dateKey,
                weight_kilograms AS weightKilograms
              FROM body_weight_entries
              ORDER BY date_key
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
        yield* migration003;
        yield* sql`
          INSERT INTO body_weight_entries ${sql.insert({
            created_at: 400,
            date_key: "2026-06-21",
            updated_at: 400,
            weight_kilograms: 82.4,
          })}
        `;
        yield* migration004;

        return {
          bodyWeightEntries: yield* findBodyWeightEntries({}),
          foods: yield* findFoods({}),
          mealEntries: yield* findMealEntries({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepStrictEqual(result.mealEntries, [
      {
        id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
        nutritionMultiplier: 1.5,
        quantityAmount: 150,
        quantityKind: "measured",
        quantityUnit: "g",
      },
    ]);
    assert.deepStrictEqual(result.foods, [
      {
        id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
        referenceAmount: 100,
        referenceUnit: "g",
      },
    ]);
    assert.deepStrictEqual(result.bodyWeightEntries, [
      {
        dateKey: "2026-06-21",
        weightKilograms: 82.4,
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
        const bodyWeightEntry = yield* testBodyWeightEntry;

        yield* store.insertPlan(plan);
        yield* store.insertFood(food);
        yield* store.upsertBodyWeightEntry(bodyWeightEntry);

        const exported = yield* backups.exportToJson();
        yield* store.replaceStores({
          activeMealPlanSelections: [],
          bodyWeightEntries: [],
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
    assert.equal(result.bodyWeightEntries.length, 1);
    assert.equal(result.bodyWeightEntries[0]?.weightKilograms, 82.4);
    assert.equal(result.plans.length, 1);
    assert.isDefined(
      result.foods.find(
        (food) => food.id === "9535a059-a61f-42e1-a2e0-35ec87203c24"
      )
    );
  });

  it("imports version 4 backups with an empty body weight history", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const backups = yield* Backup.Backups;
        const plan = yield* testPlan;
        const food = yield* testFood;

        yield* store.insertPlan(plan);
        yield* store.insertFood(food);

        const exported = yield* backups.exportToJson();
        const legacyJson = exported.json
          .replace('"databaseVersion":6', '"databaseVersion":4')
          .replace('"bodyWeightEntries":0,', "")
          .replace('"bodyWeightEntries":[],', "")
          .replaceAll('"nutritionReference":{"amount":100,"unit":"g"},', "")
          .replaceAll('"energyKcal":', '"energyKcalPer100g":')
          .replaceAll('"proteinGrams":', '"proteinGramsPer100g":')
          .replaceAll('"carbsGrams":', '"carbsGramsPer100g":')
          .replaceAll('"fatGrams":', '"fatGramsPer100g":')
          .replaceAll('"fiberGrams":', '"fiberGramsPer100g":')
          .replaceAll('"sugarGrams":', '"sugarGramsPer100g":')
          .replaceAll('"saturatedFatGrams":', '"saturatedFatGramsPer100g":')
          .replaceAll('"saltGrams":', '"saltGramsPer100g":')
          .replaceAll('"portions":[],', "");

        yield* store.replaceStores({
          activeMealPlanSelections: [],
          bodyWeightEntries: [],
          dailyLogs: [],
          foods: [],
          mealEntries: [],
          plans: [],
        });
        yield* backups.importFromJson({ input: { json: legacyJson } });

        return yield* store.readStores;
      }).pipe(Effect.provide(testLayer))
    );

    assert.equal(result.bodyWeightEntries.length, 0);
    assert.equal(result.plans.length, 1);
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
    assert.equal(result.bodyWeightEntries.length, 0);
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
  carbsGrams: 3.6,
  createdAt: 0,
  energyKcal: 59,
  fatGrams: 0.4,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  nutritionReference: { amount: 100, unit: "ml" },
  origin: "import",
  portions: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c27",
      name: "X",
      position: 0,
      size: { amount: 250, unit: "ml" },
    },
  ],
  massVolumeConversion: {
    mass: { amount: 103, unit: "g" },
    volume: { amount: 100, unit: "ml" },
  },
  proteinGrams: 10,
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
  quantity: {
    _tag: "MeasuredFoodQuantity",
    amount: 150,
    unit: "g",
  },
  nutritionMultiplier: 1.5,
  updatedAt: 0,
});

const testBodyWeightEntry = Schema.decodeEffect(Domain.BodyWeightEntry)({
  createdAt: 0,
  dateKey: "2026-06-20",
  updatedAt: 0,
  weightKilograms: 82.4,
});
