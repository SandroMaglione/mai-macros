import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;
  yield* sql`PRAGMA defer_foreign_keys = ON`;

  yield* sql`
    CREATE TABLE food_prices (
      id TEXT PRIMARY KEY NOT NULL,
      food_id TEXT NOT NULL,
      price_minor INTEGER NOT NULL CHECK (price_minor > 0),
      currency TEXT NOT NULL CHECK (
        currency IN ('EUR', 'USD', 'JPY', 'NZD')
      ),
      reference_amount REAL NOT NULL CHECK (reference_amount > 0),
      reference_unit TEXT NOT NULL CHECK (
        reference_unit IN ('g', 'kg', 'oz', 'lb', 'ml', 'l')
      ),
      is_current INTEGER NOT NULL CHECK (is_current IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (food_id)
        REFERENCES foods(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;
  yield* sql`CREATE INDEX food_prices_by_food ON food_prices(food_id)`;
  yield* sql`
    CREATE UNIQUE INDEX food_prices_current_by_food
    ON food_prices(food_id)
    WHERE is_current = 1
  `;
});
