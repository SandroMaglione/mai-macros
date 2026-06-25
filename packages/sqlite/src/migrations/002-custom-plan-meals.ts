import { Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const EmptyRequest = Schema.Struct({});

const CountRow = Schema.Struct({
  count: Schema.Number,
});

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;
  yield* sql`PRAGMA defer_foreign_keys = ON`;

  const countLegacyMealEntries = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () => sql`SELECT COUNT(*) AS count FROM meal_entries`,
  });
  const countMigratedMealEntries = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () => sql`SELECT COUNT(*) AS count FROM meal_entries`,
  });

  const legacyCount = yield* countLegacyMealEntries({});

  yield* sql`DROP INDEX IF EXISTS foods_by_name`;
  yield* sql`DROP INDEX IF EXISTS plans_by_name`;
  yield* sql`DROP INDEX IF EXISTS daily_logs_by_plan`;

  yield* sql`ALTER TABLE foods RENAME TO legacy_foods`;
  yield* sql`ALTER TABLE plans RENAME TO legacy_plans`;
  yield* sql`ALTER TABLE daily_logs RENAME TO legacy_daily_logs`;
  yield* sql`ALTER TABLE active_meal_plan_selections RENAME TO legacy_active_meal_plan_selections`;
  yield* sql`ALTER TABLE meal_entries RENAME TO legacy_meal_entries`;

  yield* sql`
    CREATE TABLE foods (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT CHECK (
        category IS NULL OR category IN (
          'bread-like',
          'dairy-egg',
          'fish-seafood',
          'fruit',
          'grain',
          'legume',
          'meat',
          'nut',
          'oil-fat',
          'plant-protein',
          'seed',
          'sweetener',
          'tuber',
          'vegetable'
        )
      ),
      origin TEXT NOT NULL CHECK (
        origin IN ('import', 'app-default', 'user')
      ),
      energy_kcal_per_100g REAL NOT NULL CHECK (energy_kcal_per_100g >= 0),
      protein_grams_per_100g REAL NOT NULL CHECK (protein_grams_per_100g >= 0),
      carbs_grams_per_100g REAL NOT NULL CHECK (carbs_grams_per_100g >= 0),
      fat_grams_per_100g REAL NOT NULL CHECK (fat_grams_per_100g >= 0),
      fiber_grams_per_100g REAL CHECK (
        fiber_grams_per_100g IS NULL OR fiber_grams_per_100g >= 0
      ),
      sugar_grams_per_100g REAL CHECK (
        sugar_grams_per_100g IS NULL OR sugar_grams_per_100g >= 0
      ),
      saturated_fat_grams_per_100g REAL CHECK (
        saturated_fat_grams_per_100g IS NULL OR saturated_fat_grams_per_100g >= 0
      ),
      salt_grams_per_100g REAL CHECK (
        salt_grams_per_100g IS NULL OR salt_grams_per_100g >= 0
      ),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `;
  yield* sql`
    INSERT INTO foods (
      id,
      name,
      brand,
      category,
      origin,
      energy_kcal_per_100g,
      protein_grams_per_100g,
      carbs_grams_per_100g,
      fat_grams_per_100g,
      fiber_grams_per_100g,
      sugar_grams_per_100g,
      saturated_fat_grams_per_100g,
      salt_grams_per_100g,
      created_at,
      updated_at
    )
    SELECT
      id,
      name,
      brand,
      category,
      origin,
      energy_kcal_per_100g,
      protein_grams_per_100g,
      carbs_grams_per_100g,
      fat_grams_per_100g,
      fiber_grams_per_100g,
      sugar_grams_per_100g,
      saturated_fat_grams_per_100g,
      salt_grams_per_100g,
      created_at,
      updated_at
    FROM legacy_foods
  `;

  yield* sql`
    CREATE TABLE plans (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      protein_target_grams REAL NOT NULL CHECK (protein_target_grams >= 0),
      carbs_target_grams REAL NOT NULL CHECK (carbs_target_grams >= 0),
      fat_target_grams REAL NOT NULL CHECK (fat_target_grams >= 0),
      fiber_target_grams REAL CHECK (
        fiber_target_grams IS NULL OR fiber_target_grams >= 0
      ),
      sugar_target_grams REAL CHECK (
        sugar_target_grams IS NULL OR sugar_target_grams >= 0
      ),
      salt_target_grams REAL CHECK (
        salt_target_grams IS NULL OR salt_target_grams >= 0
      ),
      saturated_fat_target_grams REAL CHECK (
        saturated_fat_target_grams IS NULL OR saturated_fat_target_grams >= 0
      ),
      created_at INTEGER NOT NULL
    )
  `;
  yield* sql`
    INSERT INTO plans (
      id,
      name,
      protein_target_grams,
      carbs_target_grams,
      fat_target_grams,
      fiber_target_grams,
      sugar_target_grams,
      salt_target_grams,
      saturated_fat_target_grams,
      created_at
    )
    SELECT
      id,
      name,
      protein_target_grams,
      carbs_target_grams,
      fat_target_grams,
      fiber_target_grams,
      sugar_target_grams,
      salt_target_grams,
      saturated_fat_target_grams,
      created_at
    FROM legacy_plans
  `;

  yield* sql`
    CREATE TABLE daily_logs (
      date_key TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;
  yield* sql`
    INSERT INTO daily_logs (date_key, plan_id, created_at, updated_at)
    SELECT date_key, plan_id, created_at, updated_at
    FROM legacy_daily_logs
  `;

  yield* sql`
    CREATE TABLE active_meal_plan_selections (
      id TEXT PRIMARY KEY NOT NULL CHECK (id = 'active-meal-plan'),
      plan_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;
  yield* sql`
    INSERT INTO active_meal_plan_selections (id, plan_id, updated_at)
    SELECT id, plan_id, updated_at
    FROM legacy_active_meal_plan_selections
  `;

  yield* sql`
    CREATE TABLE plan_meals (
      id TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position >= 0),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;

  yield* sql`CREATE INDEX plan_meals_by_plan ON plan_meals(plan_id)`;
  yield* sql`CREATE UNIQUE INDEX plan_meals_by_plan_name ON plan_meals(plan_id, name)`;
  yield* sql`CREATE UNIQUE INDEX plan_meals_by_plan_position ON plan_meals(plan_id, position)`;

  yield* sql`
    INSERT INTO plan_meals (id, plan_id, name, position, created_at)
    SELECT id || ':breakfast', id, 'Breakfast', 0, created_at
    FROM plans
  `;
  yield* sql`
    INSERT INTO plan_meals (id, plan_id, name, position, created_at)
    SELECT id || ':lunch', id, 'Lunch', 1, created_at
    FROM plans
  `;
  yield* sql`
    INSERT INTO plan_meals (id, plan_id, name, position, created_at)
    SELECT id || ':dinner', id, 'Dinner', 2, created_at
    FROM plans
  `;

  yield* sql`
    INSERT OR IGNORE INTO daily_logs (
      date_key,
      plan_id,
      created_at,
      updated_at
    )
    SELECT
      entry_dates.date_key,
      fallback.plan_id,
      entry_dates.created_at,
      entry_dates.updated_at
    FROM (
      SELECT
        date_key,
        MIN(created_at) AS created_at,
        MAX(updated_at) AS updated_at
      FROM legacy_meal_entries
      GROUP BY date_key
    ) AS entry_dates
    CROSS JOIN (
      SELECT COALESCE(
        (SELECT plan_id FROM active_meal_plan_selections LIMIT 1),
        (SELECT id FROM plans ORDER BY created_at DESC LIMIT 1)
      ) AS plan_id
    ) AS fallback
    LEFT JOIN daily_logs ON daily_logs.date_key = entry_dates.date_key
    WHERE daily_logs.date_key IS NULL
      AND fallback.plan_id IS NOT NULL
  `;

  yield* sql`
    CREATE TABLE meal_entries (
      id TEXT PRIMARY KEY NOT NULL,
      date_key TEXT NOT NULL,
      meal_id TEXT NOT NULL,
      food_id TEXT NOT NULL,
      quantity_grams REAL NOT NULL CHECK (quantity_grams > 0),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (food_id)
        REFERENCES foods(id)
        DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY (meal_id)
        REFERENCES plan_meals(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;

  yield* sql`
    INSERT INTO meal_entries (
      id,
      date_key,
      meal_id,
      food_id,
      quantity_grams,
      created_at,
      updated_at
    )
    SELECT
      legacy_meal_entries.id,
      legacy_meal_entries.date_key,
      daily_logs.plan_id || ':' || legacy_meal_entries.meal,
      legacy_meal_entries.food_id,
      legacy_meal_entries.quantity_grams,
      legacy_meal_entries.created_at,
      legacy_meal_entries.updated_at
    FROM legacy_meal_entries
    INNER JOIN daily_logs
      ON daily_logs.date_key = legacy_meal_entries.date_key
  `;

  const migratedCount = yield* countMigratedMealEntries({});

  if (legacyCount.count !== migratedCount.count) {
    return yield* Effect.fail(
      "Custom plan meal migration did not preserve every meal entry."
    );
  }

  yield* sql`DROP TABLE legacy_meal_entries`;
  yield* sql`DROP TABLE legacy_active_meal_plan_selections`;
  yield* sql`DROP TABLE legacy_daily_logs`;
  yield* sql`DROP TABLE legacy_plans`;
  yield* sql`DROP TABLE legacy_foods`;

  yield* sql`CREATE INDEX foods_by_name ON foods(name)`;
  yield* sql`CREATE UNIQUE INDEX plans_by_name ON plans(name)`;
  yield* sql`CREATE INDEX daily_logs_by_plan ON daily_logs(plan_id)`;
  yield* sql`CREATE INDEX meal_entries_by_date ON meal_entries(date_key)`;
  yield* sql`CREATE INDEX meal_entries_by_date_meal_id ON meal_entries(date_key, meal_id)`;
  yield* sql`CREATE INDEX meal_entries_by_food ON meal_entries(food_id)`;
  yield* sql`CREATE INDEX meal_entries_by_meal ON meal_entries(meal_id)`;
});
