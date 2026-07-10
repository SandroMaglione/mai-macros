import { DefaultFoods } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { assert, describe, it } from "vitest";

import migration001 from "../src/migrations/001-initial.ts";
import migration002 from "../src/migrations/002-custom-plan-meals.ts";
import migration003 from "../src/migrations/003-body-weight-entries.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import { TestSqliteClientLayer } from "./sqlite-test-layers.ts";

const EmptyRequest = Schema.Struct({});

const MigrationRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});

const FoodRow = Schema.Struct({
  brand: Schema.NullOr(Schema.String),
  carbsGrams: Schema.Number,
  category: Schema.NullOr(Schema.String),
  conversionMassAmount: Schema.NullOr(Schema.Number),
  conversionMassUnit: Schema.NullOr(Schema.String),
  conversionVolumeAmount: Schema.NullOr(Schema.Number),
  conversionVolumeUnit: Schema.NullOr(Schema.String),
  createdAt: Schema.Number,
  energyKcal: Schema.Number,
  fatGrams: Schema.Number,
  fiberGrams: Schema.NullOr(Schema.Number),
  id: Schema.String,
  name: Schema.String,
  nutritionReferenceAmount: Schema.Number,
  nutritionReferenceUnit: Schema.String,
  proteinGrams: Schema.Number,
  saltGrams: Schema.NullOr(Schema.Number),
  saturatedFatGrams: Schema.NullOr(Schema.Number),
  sugarGrams: Schema.NullOr(Schema.Number),
  updatedAt: Schema.Number,
});

const MealEntryRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Schema.String,
  foodId: Schema.String,
  id: Schema.String,
  mealId: Schema.String,
  nutritionMultiplier: Schema.Number,
  portionId: Schema.NullOr(Schema.String),
  portionName: Schema.NullOr(Schema.String),
  portionSizeAmount: Schema.NullOr(Schema.Number),
  portionSizeUnit: Schema.NullOr(Schema.String),
  quantityAmount: Schema.Number,
  quantityKind: Schema.String,
  quantityUnit: Schema.NullOr(Schema.String),
  updatedAt: Schema.Number,
});

const TableCountRow = Schema.Struct({
  count: Schema.Number,
  tableName: Schema.String,
});

const TableColumnRow = Schema.Struct({ name: Schema.String });

const LegacyMealEntryRow = Schema.Struct({
  id: Schema.String,
  quantityGrams: Schema.Number,
});

const QuickCheckRow = Schema.Struct({ quickCheck: Schema.String });

const testFoodId = "11111111-1111-4111-8111-111111111111";
const testPlanId = "22222222-2222-4222-8222-222222222222";
const firstEntryId = "33333333-3333-4333-8333-333333333333";
const secondEntryId = "44444444-4444-4444-8444-444444444444";

const _seedReleasedVersion3Database = Effect.fn(
  "_seedReleasedVersion3Database"
)(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* migration001;
  yield* sql`
    INSERT INTO foods ${sql.insert({
      brand: "Legacy brand",
      carbs_grams_per_100g: 3.6,
      category: "dairy-egg",
      created_at: 10,
      energy_kcal_per_100g: 59,
      fat_grams_per_100g: 0.4,
      fiber_grams_per_100g: 0,
      id: testFoodId,
      name: "Legacy yogurt",
      origin: "user",
      protein_grams_per_100g: 10,
      salt_grams_per_100g: 0.1,
      saturated_fat_grams_per_100g: 0.1,
      sugar_grams_per_100g: 3.2,
      updated_at: 20,
    })}
  `;
  yield* sql`
    INSERT INTO plans ${sql.insert({
      carbs_target_grams: 220,
      created_at: 30,
      fat_target_grams: 70,
      fiber_target_grams: 30,
      id: testPlanId,
      name: "Released plan",
      protein_target_grams: 160,
      salt_target_grams: 5,
      saturated_fat_target_grams: 20,
      sugar_target_grams: 40,
    })}
  `;
  yield* sql`
    INSERT INTO daily_logs ${sql.insert({
      created_at: 40,
      date_key: "2026-07-01",
      plan_id: testPlanId,
      updated_at: 41,
    })}
  `;
  yield* sql`
    INSERT INTO active_meal_plan_selections ${sql.insert({
      id: "active-meal-plan",
      plan_id: testPlanId,
      updated_at: 42,
    })}
  `;
  yield* sql`
    INSERT INTO meal_entries ${sql.insert({
      created_at: 50,
      date_key: "2026-07-01",
      food_id: testFoodId,
      id: firstEntryId,
      meal: "breakfast",
      quantity_grams: 150,
      updated_at: 51,
    })}
  `;
  yield* sql`
    INSERT INTO meal_entries ${sql.insert({
      created_at: 60,
      date_key: "2026-07-02",
      food_id: testFoodId,
      id: secondEntryId,
      meal: "dinner",
      quantity_grams: 33.3,
      updated_at: 61,
    })}
  `;

  yield* migration002;
  yield* migration003;
  yield* sql`
    INSERT INTO body_weight_entries ${sql.insert({
      created_at: 70,
      date_key: "2026-07-01",
      updated_at: 71,
      weight_kilograms: 82.4,
    })}
  `;

  yield* sql`
    CREATE TABLE mai_migrations (
      migration_id integer PRIMARY KEY NOT NULL,
      created_at datetime NOT NULL DEFAULT current_timestamp,
      name VARCHAR(255) NOT NULL
    )
  `;
  yield* sql`
    INSERT INTO mai_migrations (migration_id, name)
    VALUES
      (1, 'initial'),
      (2, 'custom-plan-meals'),
      (3, 'body-weight-entries')
  `;
});

const _readMigratedState = Effect.fn("_readMigratedState")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const listMigrations = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: MigrationRow,
    execute: () =>
      sql`
        SELECT migration_id AS id, name
        FROM mai_migrations
        ORDER BY migration_id
      `,
  });
  const findFood = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: FoodRow,
    execute: () =>
      sql`
        SELECT
          id,
          name,
          brand,
          category,
          nutrition_reference_amount AS nutritionReferenceAmount,
          nutrition_reference_unit AS nutritionReferenceUnit,
          conversion_mass_amount AS conversionMassAmount,
          conversion_mass_unit AS conversionMassUnit,
          conversion_volume_amount AS conversionVolumeAmount,
          conversion_volume_unit AS conversionVolumeUnit,
          energy_kcal_per_100g AS energyKcal,
          protein_grams_per_100g AS proteinGrams,
          carbs_grams_per_100g AS carbsGrams,
          fat_grams_per_100g AS fatGrams,
          fiber_grams_per_100g AS fiberGrams,
          sugar_grams_per_100g AS sugarGrams,
          saturated_fat_grams_per_100g AS saturatedFatGrams,
          salt_grams_per_100g AS saltGrams,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM foods
        WHERE id = ${testFoodId}
      `,
  });
  const listMealEntries = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: MealEntryRow,
    execute: () =>
      sql`
        SELECT
          id,
          date_key AS dateKey,
          meal_id AS mealId,
          food_id AS foodId,
          quantity_kind AS quantityKind,
          quantity_amount AS quantityAmount,
          quantity_unit AS quantityUnit,
          portion_id AS portionId,
          portion_name AS portionName,
          portion_size_amount AS portionSizeAmount,
          portion_size_unit AS portionSizeUnit,
          nutrition_multiplier AS nutritionMultiplier,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM meal_entries
        ORDER BY id
      `,
  });
  const listTableCounts = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: TableCountRow,
    execute: () =>
      sql`
        SELECT 'activeMealPlanSelections' AS tableName, COUNT(*) AS count
        FROM active_meal_plan_selections
        UNION ALL
        SELECT 'bodyWeightEntries', COUNT(*) FROM body_weight_entries
        UNION ALL
        SELECT 'dailyLogs', COUNT(*) FROM daily_logs
        UNION ALL
        SELECT 'foodPortions', COUNT(*) FROM food_portions
        UNION ALL
        SELECT 'foods', COUNT(*) FROM foods
        UNION ALL
        SELECT 'mealEntries', COUNT(*) FROM meal_entries
        UNION ALL
        SELECT 'planMeals', COUNT(*) FROM plan_meals
        UNION ALL
        SELECT 'plans', COUNT(*) FROM plans
      `,
  });
  const quickCheck = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: QuickCheckRow,
    execute: () =>
      sql`SELECT integrity_check AS quickCheck FROM pragma_integrity_check`,
  });

  return {
    food: yield* findFood({}),
    foreignKeyViolations: yield* sql`PRAGMA foreign_key_check`,
    mealEntries: yield* listMealEntries({}),
    migrations: yield* listMigrations({}),
    quickCheck: yield* quickCheck({}),
    tableCounts: yield* listTableCounts({}),
  };
});

describe("food measurement SQLite migration", () => {
  it("preserves every released version 3 value and is idempotent on restart", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* _seedReleasedVersion3Database();
        yield* runSqliteMigrations;
        const firstStartup = yield* _readMigratedState();
        yield* runSqliteMigrations;
        const secondStartup = yield* _readMigratedState();

        return { firstStartup, secondStartup };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepStrictEqual(result.firstStartup, result.secondStartup);
    assert.deepStrictEqual(result.firstStartup.migrations, [
      { id: 1, name: "initial" },
      { id: 2, name: "custom-plan-meals" },
      { id: 3, name: "body-weight-entries" },
      { id: 4, name: "food-measurements" },
    ]);
    assert.deepStrictEqual(result.firstStartup.food, {
      brand: "Legacy brand",
      carbsGrams: 3.6,
      category: "dairy-egg",
      conversionMassAmount: null,
      conversionMassUnit: null,
      conversionVolumeAmount: null,
      conversionVolumeUnit: null,
      createdAt: 10,
      energyKcal: 59,
      fatGrams: 0.4,
      fiberGrams: 0,
      id: testFoodId,
      name: "Legacy yogurt",
      nutritionReferenceAmount: 100,
      nutritionReferenceUnit: "g",
      proteinGrams: 10,
      saltGrams: 0.1,
      saturatedFatGrams: 0.1,
      sugarGrams: 3.2,
      updatedAt: 20,
    });
    assert.deepStrictEqual(result.firstStartup.mealEntries, [
      {
        createdAt: 50,
        dateKey: "2026-07-01",
        foodId: testFoodId,
        id: firstEntryId,
        mealId: `${testPlanId}:breakfast`,
        nutritionMultiplier: 1.5,
        portionId: null,
        portionName: null,
        portionSizeAmount: null,
        portionSizeUnit: null,
        quantityAmount: 150,
        quantityKind: "measured",
        quantityUnit: "g",
        updatedAt: 51,
      },
      {
        createdAt: 60,
        dateKey: "2026-07-02",
        foodId: testFoodId,
        id: secondEntryId,
        mealId: `${testPlanId}:dinner`,
        nutritionMultiplier: 33.3 / 100,
        portionId: null,
        portionName: null,
        portionSizeAmount: null,
        portionSizeUnit: null,
        quantityAmount: 33.3,
        quantityKind: "measured",
        quantityUnit: "g",
        updatedAt: 61,
      },
    ]);
    assert.deepStrictEqual(result.firstStartup.tableCounts, [
      { count: 1, tableName: "activeMealPlanSelections" },
      { count: 1, tableName: "bodyWeightEntries" },
      { count: 2, tableName: "dailyLogs" },
      { count: 0, tableName: "foodPortions" },
      {
        count: DefaultFoods.DefaultFoods.length + 1,
        tableName: "foods",
      },
      { count: 2, tableName: "mealEntries" },
      { count: 3, tableName: "planMeals" },
      { count: 1, tableName: "plans" },
    ]);
    assert.deepStrictEqual(result.firstStartup.foreignKeyViolations, []);
    assert.equal(result.firstStartup.quickCheck.quickCheck, "ok");
  });

  it("rolls back all schema and data changes when migration 4 fails", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* _seedReleasedVersion3Database();
        yield* sql`CREATE TABLE food_portions (sentinel TEXT)`;
        const failure = yield* Effect.flip(runSqliteMigrations);
        const listMigrations = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: MigrationRow,
          execute: () =>
            sql`
              SELECT migration_id AS id, name
              FROM mai_migrations
              ORDER BY migration_id
            `,
        });
        const listFoodColumns = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: TableColumnRow,
          execute: () =>
            sql`SELECT name FROM pragma_table_info('foods') ORDER BY cid`,
        });
        const listMealEntryColumns = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: TableColumnRow,
          execute: () =>
            sql`SELECT name FROM pragma_table_info('meal_entries') ORDER BY cid`,
        });
        const listMealEntries = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: LegacyMealEntryRow,
          execute: () =>
            sql`
              SELECT id, quantity_grams AS quantityGrams
              FROM meal_entries
              ORDER BY id
            `,
        });

        return {
          failure,
          foodColumns: yield* listFoodColumns({}),
          foreignKeyViolations: yield* sql`PRAGMA foreign_key_check`,
          mealEntries: yield* listMealEntries({}),
          mealEntryColumns: yield* listMealEntryColumns({}),
          migrations: yield* listMigrations({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.isDefined(result.failure);
    assert.deepStrictEqual(result.migrations, [
      { id: 1, name: "initial" },
      { id: 2, name: "custom-plan-meals" },
      { id: 3, name: "body-weight-entries" },
    ]);
    assert.isFalse(
      result.foodColumns.some(
        (column) => column.name === "nutrition_reference_amount"
      )
    );
    assert.isTrue(
      result.mealEntryColumns.some((column) => column.name === "quantity_grams")
    );
    assert.isFalse(
      result.mealEntryColumns.some((column) => column.name === "quantity_kind")
    );
    assert.deepStrictEqual(result.mealEntries, [
      { id: firstEntryId, quantityGrams: 150 },
      { id: secondEntryId, quantityGrams: 33.3 },
    ]);
    assert.deepStrictEqual(result.foreignKeyViolations, []);
  });
});
