import { DefaultFoods, Domain } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;

  yield* sql`
    CREATE TABLE foods (
      id TEXT PRIMARY KEY NOT NULL,
      based_on_food_id TEXT,
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
      origin TEXT NOT NULL CHECK (origin IN ('app-default', 'user')),
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
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (based_on_food_id)
        REFERENCES foods(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;

  yield* sql`CREATE INDEX foods_by_name ON foods(name)`;

  yield* sql`
    CREATE TABLE plans (
      id TEXT PRIMARY KEY NOT NULL,
      based_on_plan_id TEXT,
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
      created_at INTEGER NOT NULL,
      FOREIGN KEY (based_on_plan_id)
        REFERENCES plans(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;

  yield* sql`CREATE UNIQUE INDEX plans_by_name ON plans(name)`;

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

  yield* sql`CREATE INDEX daily_logs_by_plan ON daily_logs(plan_id)`;

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
    CREATE TABLE meal_entries (
      id TEXT PRIMARY KEY NOT NULL,
      date_key TEXT NOT NULL,
      meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner')),
      food_id TEXT NOT NULL,
      quantity_grams REAL NOT NULL CHECK (quantity_grams > 0),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (food_id)
        REFERENCES foods(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;

  yield* sql`CREATE INDEX meal_entries_by_date ON meal_entries(date_key)`;
  yield* sql`CREATE INDEX meal_entries_by_date_meal ON meal_entries(date_key, meal)`;
  yield* sql`CREATE INDEX meal_entries_by_food ON meal_entries(food_id)`;

  const defaultFoods = yield* Schema.decodeEffect(Schema.Array(Domain.Food))(
    DefaultFoods.DefaultFoods
  );

  yield* Effect.forEach(
    defaultFoods,
    (food) =>
      Effect.gen(function* () {
        const encodedFood = yield* Schema.encodeEffect(Domain.Food)(food);

        yield* sql`
          INSERT INTO foods ${sql.insert({
            based_on_food_id: encodedFood.basedOnFoodId ?? null,
            brand: encodedFood.brand ?? null,
            carbs_grams_per_100g: encodedFood.carbsGramsPer100g,
            category: encodedFood.category ?? null,
            created_at: encodedFood.createdAt,
            energy_kcal_per_100g: encodedFood.energyKcalPer100g,
            fat_grams_per_100g: encodedFood.fatGramsPer100g,
            fiber_grams_per_100g: encodedFood.fiberGramsPer100g ?? null,
            id: encodedFood.id,
            name: encodedFood.name,
            origin: encodedFood.origin,
            protein_grams_per_100g: encodedFood.proteinGramsPer100g,
            salt_grams_per_100g: encodedFood.saltGramsPer100g ?? null,
            saturated_fat_grams_per_100g:
              encodedFood.saturatedFatGramsPer100g ?? null,
            sugar_grams_per_100g: encodedFood.sugarGramsPer100g ?? null,
            updated_at: encodedFood.updatedAt,
          })}
        `;
      }),
    { discard: true }
  );
});
