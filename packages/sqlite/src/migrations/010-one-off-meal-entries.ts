import { Array, Data, Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

class OneOffMigrationIntegrityError extends Data.TaggedError(
  "OneOffMigrationIntegrityError"
)<{ readonly detail: string }> {}

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE next_meal_entries (
      id TEXT PRIMARY KEY NOT NULL,
      date_key TEXT NOT NULL,
      meal_id TEXT NOT NULL,
      food_id TEXT,
      kind TEXT NOT NULL DEFAULT 'catalog' CHECK (kind IN ('catalog', 'one-off')),
      quantity_accuracy TEXT NOT NULL DEFAULT 'unspecified' CHECK (quantity_accuracy IN ('unspecified', 'measured', 'estimated')),
      one_off TEXT CHECK (one_off IS NULL OR json_valid(one_off)),
      quantity_kind TEXT CHECK (
        quantity_kind IN ('measured', 'portion')
      ),
      quantity_amount REAL CHECK (quantity_amount > 0),
      quantity_unit TEXT CHECK (
        quantity_unit IS NULL OR
        quantity_unit IN ('g', 'kg', 'oz', 'lb', 'ml', 'l')
      ),
      portion_id TEXT,
      portion_name TEXT,
      portion_size_amount REAL CHECK (
        portion_size_amount IS NULL OR portion_size_amount > 0
      ),
      portion_size_unit TEXT CHECK (
        portion_size_unit IS NULL OR
        portion_size_unit IN ('g', 'kg', 'oz', 'lb', 'ml', 'l')
      ),
      nutrition_multiplier REAL CHECK (nutrition_multiplier > 0),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (
        (kind = 'one-off' AND one_off IS NOT NULL AND food_id IS NULL AND
         quantity_kind IS NULL AND quantity_amount IS NULL AND quantity_unit IS NULL AND
         portion_id IS NULL AND portion_name IS NULL AND portion_size_amount IS NULL AND
         portion_size_unit IS NULL AND nutrition_multiplier IS NULL AND quantity_accuracy = 'unspecified') OR
        (kind = 'catalog' AND one_off IS NULL AND food_id IS NOT NULL AND
         quantity_kind IS NOT NULL AND quantity_amount IS NOT NULL AND nutrition_multiplier IS NOT NULL AND (
        (quantity_kind = 'measured' AND quantity_unit IS NOT NULL AND
          portion_id IS NULL AND portion_name IS NULL AND
          portion_size_amount IS NULL AND portion_size_unit IS NULL) OR
        (quantity_kind = 'portion' AND quantity_unit IS NULL AND
          portion_id IS NOT NULL AND portion_name IS NOT NULL AND
          portion_size_amount IS NOT NULL AND portion_size_unit IS NOT NULL)))
      ),
      FOREIGN KEY (food_id)
        REFERENCES foods(id)
        DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY (meal_id)
        REFERENCES plan_meals(id)
        DEFERRABLE INITIALLY DEFERRED
    )

  `;
  yield* sql`INSERT INTO next_meal_entries (rowid, id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at) SELECT rowid, id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at FROM meal_entries`;
  const mismatches = yield* SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: Schema.Struct({ id: Schema.String }),
    execute: () => sql`SELECT id FROM (
      SELECT id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at FROM meal_entries
      EXCEPT SELECT id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at FROM next_meal_entries
    ) UNION ALL SELECT id FROM (
      SELECT id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at FROM next_meal_entries
      EXCEPT SELECT id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at FROM meal_entries
    )`,
  })({});
  if (Array.isReadonlyArrayNonEmpty(mismatches))
    return yield* new OneOffMigrationIntegrityError({
      detail: "Meal entries did not copy exactly.",
    });
  yield* sql`DROP TABLE meal_entries`;
  yield* sql`ALTER TABLE next_meal_entries RENAME TO meal_entries`;
  yield* sql`CREATE INDEX meal_entries_by_date ON meal_entries(date_key)`;
  yield* sql`CREATE INDEX meal_entries_by_date_meal_id ON meal_entries(date_key, meal_id)`;
  yield* sql`CREATE INDEX meal_entries_by_food ON meal_entries(food_id)`;
  yield* sql`CREATE INDEX meal_entries_by_meal ON meal_entries(meal_id)`;
  yield* sql`CREATE INDEX meal_entries_by_kind_date ON meal_entries(kind, date_key)`;
  const violations = yield* SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: Schema.Struct({ parent: Schema.String }),
    execute: () => sql`SELECT parent FROM pragma_foreign_key_check`,
  })({});
  const checks = yield* SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: Schema.Struct({ quick_check: Schema.String }),
    execute: () => sql`PRAGMA quick_check`,
  })({});
  if (
    Array.isReadonlyArrayNonEmpty(violations) ||
    checks.length !== 1 ||
    checks[0]?.quick_check !== "ok"
  ) {
    return yield* new OneOffMigrationIntegrityError({
      detail: "Database integrity check failed.",
    });
  }
});
