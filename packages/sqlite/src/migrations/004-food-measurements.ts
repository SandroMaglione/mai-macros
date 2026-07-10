import { Array, Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const EmptyRequest = Schema.Struct({});

const CountRow = Schema.Struct({ count: Schema.Number });

const QuickCheckRow = Schema.Struct({ quickCheck: Schema.String });

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;
  yield* sql`PRAGMA defer_foreign_keys = ON`;

  const countMealEntries = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () => sql`SELECT COUNT(*) AS count FROM meal_entries`,
  });
  const legacyCount = yield* countMealEntries({});

  yield* sql`
    ALTER TABLE foods
    ADD COLUMN nutrition_reference_amount REAL NOT NULL DEFAULT 100
      CHECK (nutrition_reference_amount > 0)
  `;
  yield* sql`
    ALTER TABLE foods
    ADD COLUMN nutrition_reference_unit TEXT NOT NULL DEFAULT 'g'
      CHECK (nutrition_reference_unit IN ('g', 'kg', 'oz', 'lb', 'ml', 'l'))
  `;
  yield* sql`
    ALTER TABLE foods
    ADD COLUMN conversion_mass_amount REAL
      CHECK (conversion_mass_amount IS NULL OR conversion_mass_amount > 0)
  `;
  yield* sql`
    ALTER TABLE foods
    ADD COLUMN conversion_mass_unit TEXT
      CHECK (conversion_mass_unit IS NULL OR conversion_mass_unit IN ('g', 'kg', 'oz', 'lb'))
  `;
  yield* sql`
    ALTER TABLE foods
    ADD COLUMN conversion_volume_amount REAL
      CHECK (conversion_volume_amount IS NULL OR conversion_volume_amount > 0)
  `;
  yield* sql`
    ALTER TABLE foods
    ADD COLUMN conversion_volume_unit TEXT
      CHECK (conversion_volume_unit IS NULL OR conversion_volume_unit IN ('ml', 'l'))
  `;

  yield* sql`
    CREATE TABLE food_portions (
      id TEXT PRIMARY KEY NOT NULL,
      food_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size_amount REAL NOT NULL CHECK (size_amount > 0),
      size_unit TEXT NOT NULL CHECK (
        size_unit IN ('g', 'kg', 'oz', 'lb', 'ml', 'l')
      ),
      position INTEGER NOT NULL CHECK (position >= 0),
      FOREIGN KEY (food_id)
        REFERENCES foods(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;
  yield* sql`CREATE INDEX food_portions_by_food ON food_portions(food_id)`;
  yield* sql`CREATE UNIQUE INDEX food_portions_by_food_name ON food_portions(food_id, name)`;
  yield* sql`CREATE UNIQUE INDEX food_portions_by_food_position ON food_portions(food_id, position)`;

  yield* sql`ALTER TABLE meal_entries RENAME TO legacy_measurement_meal_entries`;
  yield* sql`
    CREATE TABLE meal_entries (
      id TEXT PRIMARY KEY NOT NULL,
      date_key TEXT NOT NULL,
      meal_id TEXT NOT NULL,
      food_id TEXT NOT NULL,
      quantity_kind TEXT NOT NULL CHECK (
        quantity_kind IN ('measured', 'portion')
      ),
      quantity_amount REAL NOT NULL CHECK (quantity_amount > 0),
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
      nutrition_multiplier REAL NOT NULL CHECK (nutrition_multiplier > 0),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (
        (quantity_kind = 'measured' AND quantity_unit IS NOT NULL AND
          portion_id IS NULL AND portion_name IS NULL AND
          portion_size_amount IS NULL AND portion_size_unit IS NULL) OR
        (quantity_kind = 'portion' AND quantity_unit IS NULL AND
          portion_id IS NOT NULL AND portion_name IS NOT NULL AND
          portion_size_amount IS NOT NULL AND portion_size_unit IS NOT NULL)
      ),
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
      quantity_kind,
      quantity_amount,
      quantity_unit,
      nutrition_multiplier,
      created_at,
      updated_at
    )
    SELECT
      id,
      date_key,
      meal_id,
      food_id,
      'measured',
      quantity_grams,
      'g',
      quantity_grams / 100.0,
      created_at,
      updated_at
    FROM legacy_measurement_meal_entries
  `;

  const migratedCount = yield* countMealEntries({});

  if (legacyCount.count !== migratedCount.count) {
    return yield* Effect.fail(
      "Food measurement migration did not preserve every meal entry."
    );
  }

  const countMismatchedMealEntries = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () =>
      sql`
        SELECT COUNT(*) AS count
        FROM legacy_measurement_meal_entries AS legacy
        LEFT JOIN meal_entries AS migrated ON migrated.id = legacy.id
        WHERE
          migrated.id IS NULL OR
          migrated.date_key IS NOT legacy.date_key OR
          migrated.meal_id IS NOT legacy.meal_id OR
          migrated.food_id IS NOT legacy.food_id OR
          migrated.quantity_kind IS NOT 'measured' OR
          migrated.quantity_amount IS NOT legacy.quantity_grams OR
          migrated.quantity_unit IS NOT 'g' OR
          migrated.portion_id IS NOT NULL OR
          migrated.portion_name IS NOT NULL OR
          migrated.portion_size_amount IS NOT NULL OR
          migrated.portion_size_unit IS NOT NULL OR
          ABS(
            migrated.nutrition_multiplier - legacy.quantity_grams / 100.0
          ) > 0.000000000001 OR
          migrated.created_at IS NOT legacy.created_at OR
          migrated.updated_at IS NOT legacy.updated_at
      `,
  });
  const mismatchedMealEntries = yield* countMismatchedMealEntries({});

  if (mismatchedMealEntries.count !== 0) {
    return yield* Effect.fail(
      "Food measurement migration changed legacy meal entry data."
    );
  }

  const countInvalidFoodDefaults = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () =>
      sql`
        SELECT COUNT(*) AS count
        FROM foods
        WHERE
          nutrition_reference_amount IS NOT 100 OR
          nutrition_reference_unit IS NOT 'g' OR
          conversion_mass_amount IS NOT NULL OR
          conversion_mass_unit IS NOT NULL OR
          conversion_volume_amount IS NOT NULL OR
          conversion_volume_unit IS NOT NULL
      `,
  });
  const invalidFoodDefaults = yield* countInvalidFoodDefaults({});

  if (invalidFoodDefaults.count !== 0) {
    return yield* Effect.fail(
      "Food measurement migration did not preserve legacy 100 g food references."
    );
  }

  const foreignKeyViolations = yield* sql`PRAGMA foreign_key_check`;

  if (Array.isReadonlyArrayNonEmpty(foreignKeyViolations)) {
    return yield* Effect.fail(
      "Food measurement migration introduced a foreign key violation."
    );
  }

  yield* sql`DROP TABLE legacy_measurement_meal_entries`;
  yield* sql`CREATE INDEX meal_entries_by_date ON meal_entries(date_key)`;
  yield* sql`CREATE INDEX meal_entries_by_date_meal_id ON meal_entries(date_key, meal_id)`;
  yield* sql`CREATE INDEX meal_entries_by_food ON meal_entries(food_id)`;
  yield* sql`CREATE INDEX meal_entries_by_meal ON meal_entries(meal_id)`;

  const quickCheck = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: QuickCheckRow,
    execute: () =>
      sql`SELECT quick_check AS quickCheck FROM pragma_quick_check`,
  });
  const quickCheckResult = yield* quickCheck({});

  if (quickCheckResult.quickCheck !== "ok") {
    return yield* Effect.fail(
      `Food measurement migration failed SQLite quick check: ${quickCheckResult.quickCheck}`
    );
  }
});
