import { Effect, Exit, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { assert, describe, it } from "vitest";

import migration001 from "../src/migrations/001-initial.ts";
import migration002 from "../src/migrations/002-custom-plan-meals.ts";
import migration003 from "../src/migrations/003-body-weight-entries.ts";
import migration004 from "../src/migrations/004-food-measurements.ts";
import migration005 from "../src/migrations/005-food-prices.ts";
import migration006 from "../src/migrations/006-event-tracking.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import { TestSqliteClientLayer } from "./sqlite-test-layers.ts";

const EmptyRequest = Schema.Struct({});

const DailyLogRow = Schema.Struct({
  dateKey: Schema.String,
  mode: Schema.String,
  planId: Schema.String,
});

const TableColumnRow = Schema.Struct({
  defaultValue: Schema.NullOr(Schema.String),
  isNotNull: Schema.Number,
  name: Schema.String,
  type: Schema.String,
});

const MigrationRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});

describe("fasting days SQLite migration", () => {
  it("creates the constrained mode column on a fresh database", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runSqliteMigrations;
        const listColumns = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: TableColumnRow,
          execute: () =>
            sql`
              SELECT
                name,
                type,
                "notnull" AS isNotNull,
                dflt_value AS defaultValue
              FROM pragma_table_info('daily_logs')
              ORDER BY cid
            `,
        });
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

        return {
          columns: yield* listColumns({}),
          migrations: yield* listMigrations({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepEqual(
      result.columns.find(({ name }) => name === "mode"),
      {
        defaultValue: "'eating'",
        isNotNull: 1,
        name: "mode",
        type: "TEXT",
      }
    );
    assert.deepEqual(result.migrations.at(-1), {
      id: 8,
      name: "not-recorded-days",
    });
  });

  it("preserves existing daily logs as eating days and enforces valid modes", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* migration001;
        yield* migration002;
        yield* migration003;
        yield* migration004;
        yield* migration005;
        yield* migration006;
        yield* sql`
          INSERT INTO plans ${sql.insert({
            carbs_target_grams: 200,
            created_at: 100,
            fat_target_grams: 70,
            id: "11111111-1111-4111-8111-111111111111",
            name: "Existing plan",
            protein_target_grams: 150,
          })}
        `;
        yield* sql`
          INSERT INTO daily_logs ${sql.insert({
            created_at: 100,
            date_key: "2026-08-05",
            plan_id: "11111111-1111-4111-8111-111111111111",
            updated_at: 100,
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
            (3, 'body-weight-entries'),
            (4, 'food-measurements'),
            (5, 'food-prices'),
            (6, 'event-tracking')
        `;
        yield* runSqliteMigrations;
        const findDailyLog = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: DailyLogRow,
          execute: () =>
            sql`
              SELECT date_key AS dateKey, mode, plan_id AS planId
              FROM daily_logs
              WHERE date_key = '2026-08-05'
            `,
        });
        const dailyLog = yield* findDailyLog({});
        const invalidModeExit = yield* Effect.exit(
          sql`UPDATE daily_logs SET mode = 'invalid' WHERE date_key = '2026-08-05'`
        );
        yield* sql`
          UPDATE daily_logs
          SET mode = 'fasting'
          WHERE date_key = '2026-08-05'
        `;

        return {
          dailyLog,
          invalidModeExit,
          updatedDailyLog: yield* findDailyLog({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.equal(result.dailyLog.mode, "eating");
    assert.equal(
      result.dailyLog.planId,
      "11111111-1111-4111-8111-111111111111"
    );
    assert.isTrue(Exit.isFailure(result.invalidModeExit));
    assert.equal(result.updatedDailyLog.mode, "fasting");
  });
});
