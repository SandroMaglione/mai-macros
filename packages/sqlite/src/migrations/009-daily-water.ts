import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE daily_logs
    ADD COLUMN water_servings INTEGER DEFAULT NULL
      CHECK (
        water_servings IS NULL OR
        (water_servings >= 0 AND typeof(water_servings) = 'integer')
      )
  `;
});
