import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE body_weight_entries (
      date_key TEXT PRIMARY KEY NOT NULL,
      weight_kilograms REAL NOT NULL CHECK (weight_kilograms > 0),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `;
});
