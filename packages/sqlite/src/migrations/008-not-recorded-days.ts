import { Array, Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const EmptyRequest = Schema.Struct({});

const CountRow = Schema.Struct({ count: Schema.Number });

const QuickCheckRow = Schema.Struct({ quickCheck: Schema.String });

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const countDailyLogs = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () => sql`SELECT COUNT(*) AS count FROM daily_logs`,
  });
  const countNextDailyLogs = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () => sql`SELECT COUNT(*) AS count FROM next_daily_logs`,
  });
  const countMismatchedDailyLogs = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: CountRow,
    execute: () =>
      sql`
        SELECT COUNT(*) AS count
        FROM daily_logs AS existing
        LEFT JOIN next_daily_logs AS migrated
          ON migrated.date_key = existing.date_key
        WHERE
          migrated.date_key IS NULL OR
          migrated.plan_id IS NOT existing.plan_id OR
          migrated.created_at IS NOT existing.created_at OR
          migrated.updated_at IS NOT existing.updated_at OR
          migrated.mode IS NOT existing.mode
      `,
  });
  const existingCount = yield* countDailyLogs({});

  yield* sql`
    CREATE TABLE next_daily_logs (
      date_key TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT 'eating'
        CHECK (mode IN ('eating', 'fasting', 'not-recorded')),
      FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        DEFERRABLE INITIALLY DEFERRED
    )
  `;
  yield* sql`
    INSERT INTO next_daily_logs (
      date_key,
      plan_id,
      created_at,
      updated_at,
      mode
    )
    SELECT date_key, plan_id, created_at, updated_at, mode
    FROM daily_logs
  `;

  const migratedCount = yield* countNextDailyLogs({});

  if (migratedCount.count !== existingCount.count) {
    return yield* Effect.fail(
      "Not-recorded day migration did not preserve every daily log."
    );
  }

  const mismatchedDailyLogs = yield* countMismatchedDailyLogs({});

  if (mismatchedDailyLogs.count !== 0) {
    return yield* Effect.fail(
      "Not-recorded day migration changed existing daily log data."
    );
  }

  yield* sql`DROP TABLE daily_logs`;
  yield* sql`ALTER TABLE next_daily_logs RENAME TO daily_logs`;
  yield* sql`CREATE INDEX daily_logs_by_plan ON daily_logs(plan_id)`;

  const foreignKeyViolations = yield* sql`PRAGMA foreign_key_check`;

  if (Array.isReadonlyArrayNonEmpty(foreignKeyViolations)) {
    return yield* Effect.fail(
      "Not-recorded day migration introduced a foreign key violation."
    );
  }

  const quickCheck = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: QuickCheckRow,
    execute: () =>
      sql`SELECT quick_check AS quickCheck FROM pragma_quick_check`,
  });
  const quickCheckResult = yield* quickCheck({});

  if (quickCheckResult.quickCheck !== "ok") {
    return yield* Effect.fail(
      `Not-recorded day migration failed SQLite quick check: ${quickCheckResult.quickCheck}`
    );
  }
});
