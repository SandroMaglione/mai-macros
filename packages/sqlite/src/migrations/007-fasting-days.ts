import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE daily_logs
    ADD COLUMN mode TEXT NOT NULL DEFAULT 'eating'
      CHECK (mode IN ('eating', 'fasting'))
  `;
});
