import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteClient as NodeSqliteClient } from "@effect/sql-sqlite-node";
import { Array, Effect, Exit, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { assert, describe, it } from "vitest";

import migration001 from "../src/migrations/001-initial.ts";
import migration002 from "../src/migrations/002-custom-plan-meals.ts";
import migration003 from "../src/migrations/003-body-weight-entries.ts";
import migration004 from "../src/migrations/004-food-measurements.ts";
import migration005 from "../src/migrations/005-food-prices.ts";
import migration006 from "../src/migrations/006-event-tracking.ts";
import migration007 from "../src/migrations/007-fasting-days.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import { TestSqliteClientLayer } from "./sqlite-test-layers.ts";

const EmptyRequest = Schema.Struct({});

const DailyLogRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Schema.String,
  mode: Schema.String,
  planId: Schema.String,
  updatedAt: Schema.Number,
});

const MealEntryRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Schema.String,
  foodId: Schema.String,
  id: Schema.String,
  mealId: Schema.String,
  nutritionMultiplier: Schema.Number,
  quantityAmount: Schema.Number,
  quantityKind: Schema.String,
  quantityUnit: Schema.NullOr(Schema.String),
  updatedAt: Schema.Number,
});

const MigrationRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});

const SchemaObjectRow = Schema.Struct({
  name: Schema.String,
  sql: Schema.NullOr(Schema.String),
  type: Schema.String,
});

const TableColumnRow = Schema.Struct({
  defaultValue: Schema.NullOr(Schema.String),
  isNotNull: Schema.Number,
  name: Schema.String,
  primaryKey: Schema.Number,
  type: Schema.String,
});

const ForeignKeyRow = Schema.Struct({
  onDelete: Schema.String,
  onUpdate: Schema.String,
  sourceColumn: Schema.String,
  targetColumn: Schema.String,
  targetTable: Schema.String,
});

const planId = "11111111-1111-4111-8111-111111111111";
const mealId = "22222222-2222-4222-8222-222222222222";
const foodId = "33333333-3333-4333-8333-333333333333";

const _seedReleasedVersion7Database = Effect.fn(
  "_seedReleasedVersion7Database"
)(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;
  yield* migration001;
  yield* migration002;
  yield* migration003;
  yield* migration004;
  yield* migration005;
  yield* migration006;
  yield* migration007;
  yield* sql`
    INSERT INTO plans ${sql.insert({
      carbs_target_grams: 201,
      created_at: 101,
      fat_target_grams: 71,
      fiber_target_grams: 31,
      id: planId,
      name: "Migration plan",
      protein_target_grams: 151,
      salt_target_grams: 6,
      saturated_fat_target_grams: 21,
      sugar_target_grams: 41,
    })}
  `;
  yield* sql`
    INSERT INTO plan_meals ${sql.insert({
      created_at: 102,
      id: mealId,
      name: "Migration meal",
      plan_id: planId,
      position: 4,
    })}
  `;
  yield* sql`
    INSERT INTO foods ${sql.insert({
      carbs_grams_per_100g: 22,
      created_at: 103,
      energy_kcal_per_100g: 123,
      fat_grams_per_100g: 4,
      fiber_grams_per_100g: 5,
      id: foodId,
      name: "Migration food",
      origin: "user",
      protein_grams_per_100g: 6,
      salt_grams_per_100g: 0.7,
      saturated_fat_grams_per_100g: 1.2,
      sugar_grams_per_100g: 8,
      updated_at: 104,
    })}
  `;
  yield* sql`
    INSERT INTO daily_logs ${sql.insert([
      {
        created_at: 105,
        date_key: "2026-08-05",
        mode: "eating",
        plan_id: planId,
        updated_at: 106,
      },
      {
        created_at: 107,
        date_key: "2026-08-06",
        mode: "fasting",
        plan_id: planId,
        updated_at: 108,
      },
    ])}
  `;
  yield* sql`
    INSERT INTO active_meal_plan_selections ${sql.insert({
      id: "active-meal-plan",
      plan_id: planId,
      updated_at: 109,
    })}
  `;
  yield* sql`
    INSERT INTO meal_entries ${sql.insert([
      {
        created_at: 110,
        date_key: "2026-08-05",
        food_id: foodId,
        id: "44444444-4444-4444-8444-444444444444",
        meal_id: mealId,
        nutrition_multiplier: 1.25,
        quantity_amount: 125,
        quantity_kind: "measured",
        quantity_unit: "g",
        updated_at: 111,
      },
      {
        created_at: 112,
        date_key: "2026-08-06",
        food_id: foodId,
        id: "55555555-5555-4555-8555-555555555555",
        meal_id: mealId,
        nutrition_multiplier: 0.5,
        quantity_amount: 50,
        quantity_kind: "measured",
        quantity_unit: "g",
        updated_at: 113,
      },
    ])}
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
      (6, 'event-tracking'),
      (7, 'fasting-days')
  `;
});

const _readMigrationEvidence = Effect.fn("_readMigrationEvidence")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    const listDailyLogs = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: DailyLogRow,
      execute: () =>
        sql`
        SELECT
          date_key AS dateKey,
          mode,
          plan_id AS planId,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM daily_logs
        ORDER BY date_key
      `,
    });
    const listMealEntries = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: MealEntryRow,
      execute: () =>
        sql`
        SELECT
          id,
          date_key AS dateKey,
          meal_id AS mealId,
          food_id AS foodId,
          quantity_kind AS quantityKind,
          quantity_amount AS quantityAmount,
          quantity_unit AS quantityUnit,
          nutrition_multiplier AS nutritionMultiplier,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM meal_entries
        ORDER BY id
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
    const listDailyLogSchemaObjects = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: SchemaObjectRow,
      execute: () =>
        sql`
        SELECT name, sql, type
        FROM sqlite_schema
        WHERE tbl_name = 'daily_logs' OR name = 'next_daily_logs'
        ORDER BY name
      `,
    });
    const listDailyLogColumns = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: TableColumnRow,
      execute: () =>
        sql`
        SELECT
          name,
          type,
          "notnull" AS isNotNull,
          dflt_value AS defaultValue,
          pk AS primaryKey
        FROM pragma_table_info('daily_logs')
        ORDER BY cid
      `,
    });
    const listDailyLogForeignKeys = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: ForeignKeyRow,
      execute: () =>
        sql`
        SELECT
          "from" AS sourceColumn,
          "to" AS targetColumn,
          "table" AS targetTable,
          on_delete AS onDelete,
          on_update AS onUpdate
        FROM pragma_foreign_key_list('daily_logs')
      `,
    });

    return {
      columns: yield* listDailyLogColumns({}),
      dailyLogs: yield* listDailyLogs({}),
      foreignKeyViolations: yield* sql`PRAGMA foreign_key_check`,
      foreignKeys: yield* listDailyLogForeignKeys({}),
      mealEntries: yield* listMealEntries({}),
      migrations: yield* listMigrations({}),
      quickCheck: yield* sql`PRAGMA quick_check`,
      schemaObjects: yield* listDailyLogSchemaObjects({}),
    };
  }
);

describe("not-recorded days SQLite migration", () => {
  it("preserves every daily-log field and related meal data through the real startup path", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* _seedReleasedVersion7Database();
        const before = yield* _readMigrationEvidence();

        yield* runSqliteMigrations;
        const afterFirstStartup = yield* _readMigrationEvidence();
        yield* runSqliteMigrations;
        const afterSecondStartup = yield* _readMigrationEvidence();

        yield* sql`
          UPDATE daily_logs
          SET mode = 'not-recorded'
          WHERE date_key = '2026-08-05'
        `;
        const invalidModeExit = yield* Effect.exit(
          sql`
            UPDATE daily_logs
            SET mode = 'invalid'
            WHERE date_key = '2026-08-06'
          `
        );

        return {
          afterFirstStartup,
          afterModeUpdate: yield* _readMigrationEvidence(),
          afterSecondStartup,
          before,
          invalidModeExit,
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepEqual(
      result.afterFirstStartup.dailyLogs,
      result.before.dailyLogs
    );
    assert.deepEqual(
      result.afterFirstStartup.mealEntries,
      result.before.mealEntries
    );
    assert.deepEqual(result.afterSecondStartup, result.afterFirstStartup);
    assert.deepEqual(result.afterFirstStartup.columns, [
      {
        defaultValue: null,
        isNotNull: 1,
        name: "date_key",
        primaryKey: 1,
        type: "TEXT",
      },
      {
        defaultValue: null,
        isNotNull: 1,
        name: "plan_id",
        primaryKey: 0,
        type: "TEXT",
      },
      {
        defaultValue: null,
        isNotNull: 1,
        name: "created_at",
        primaryKey: 0,
        type: "INTEGER",
      },
      {
        defaultValue: null,
        isNotNull: 1,
        name: "updated_at",
        primaryKey: 0,
        type: "INTEGER",
      },
      {
        defaultValue: "'eating'",
        isNotNull: 1,
        name: "mode",
        primaryKey: 0,
        type: "TEXT",
      },
      {
        defaultValue: "NULL",
        isNotNull: 0,
        name: "water_servings",
        primaryKey: 0,
        type: "INTEGER",
      },
    ]);
    assert.deepEqual(result.afterFirstStartup.foreignKeys, [
      {
        onDelete: "NO ACTION",
        onUpdate: "NO ACTION",
        sourceColumn: "plan_id",
        targetColumn: "id",
        targetTable: "plans",
      },
    ]);
    assert.deepEqual(result.afterFirstStartup.foreignKeyViolations, []);
    assert.deepEqual(result.afterFirstStartup.quickCheck, [
      { quick_check: "ok" },
    ]);
    assert.deepEqual(result.afterFirstStartup.migrations.at(-1), {
      id: 9,
      name: "daily-water",
    });
    assert.equal(
      result.afterFirstStartup.migrations.filter(({ id }) => id === 8).length,
      1
    );
    assert.deepEqual(
      result.afterFirstStartup.schemaObjects.map(({ name, type }) => ({
        name,
        type,
      })),
      [
        { name: "daily_logs", type: "table" },
        { name: "daily_logs_by_plan", type: "index" },
        { name: "sqlite_autoindex_daily_logs_1", type: "index" },
      ]
    );
    assert.isTrue(Exit.isFailure(result.invalidModeExit));
    assert.deepEqual(
      result.afterModeUpdate.dailyLogs.map(({ dateKey, mode }) => ({
        dateKey,
        mode,
      })),
      [
        { dateKey: "2026-08-05", mode: "not-recorded" },
        { dateKey: "2026-08-06", mode: "fasting" },
      ]
    );
  });

  it("rolls the entire rebuild back if the migration ledger write fails", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* _seedReleasedVersion7Database();
        const before = yield* _readMigrationEvidence();
        yield* sql`
          CREATE TRIGGER fail_migration_8
          BEFORE INSERT ON mai_migrations
          WHEN NEW.migration_id = 8
          BEGIN
            SELECT RAISE(ABORT, 'forced migration ledger failure');
          END
        `;

        const migrationExit = yield* Effect.exit(runSqliteMigrations);
        const afterFailure = yield* _readMigrationEvidence();
        const notRecordedModeExit = yield* Effect.exit(
          sql`
            UPDATE daily_logs
            SET mode = 'not-recorded'
            WHERE date_key = '2026-08-05'
          `
        );

        yield* sql`DROP TRIGGER fail_migration_8`;
        yield* runSqliteMigrations;

        return {
          afterFailure,
          afterRetry: yield* _readMigrationEvidence(),
          before,
          migrationExit,
          notRecordedModeExit,
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.isTrue(Exit.isFailure(result.migrationExit));
    assert.deepEqual(result.afterFailure, result.before);
    assert.isTrue(Exit.isFailure(result.notRecordedModeExit));
    assert.deepEqual(result.afterRetry.dailyLogs, result.before.dailyLogs);
    assert.deepEqual(result.afterRetry.mealEntries, result.before.mealEntries);
    assert.deepEqual(result.afterRetry.migrations.at(-1), {
      id: 9,
      name: "daily-water",
    });
    assert.deepEqual(result.afterRetry.foreignKeyViolations, []);
    assert.isTrue(
      Array.some(
        result.afterRetry.schemaObjects,
        ({ name }) => name === "daily_logs_by_plan"
      )
    );
  });

  it("persists the migrated schema and data after closing and reopening a file database", async () => {
    const temporaryDirectory = await Effect.runPromise(
      Effect.tryPromise(() =>
        mkdtemp(join(tmpdir(), "mai-not-recorded-migration-"))
      )
    );
    const filename = join(temporaryDirectory, "mai.sqlite");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const migrateResult = yield* Effect.gen(function* () {
          yield* _seedReleasedVersion7Database();
          const before = yield* _readMigrationEvidence();
          yield* runSqliteMigrations;

          return {
            after: yield* _readMigrationEvidence(),
            before,
          };
        }).pipe(
          Effect.provide(
            NodeSqliteClient.layer({
              disableWAL: true,
              filename,
            })
          )
        );
        const reopened = yield* Effect.gen(function* () {
          yield* runSqliteMigrations;

          return yield* _readMigrationEvidence();
        }).pipe(
          Effect.provide(
            NodeSqliteClient.layer({
              disableWAL: true,
              filename,
            })
          )
        );

        return { migrateResult, reopened };
      }).pipe(
        Effect.ensuring(
          Effect.tryPromise(() =>
            rm(temporaryDirectory, { force: true, recursive: true })
          ).pipe(Effect.orDie)
        )
      )
    );

    assert.deepEqual(
      result.migrateResult.after.dailyLogs,
      result.migrateResult.before.dailyLogs
    );
    assert.deepEqual(
      result.migrateResult.after.mealEntries,
      result.migrateResult.before.mealEntries
    );
    assert.deepEqual(result.reopened, result.migrateResult.after);
    assert.deepEqual(result.reopened.foreignKeyViolations, []);
    assert.deepEqual(result.reopened.quickCheck, [{ quick_check: "ok" }]);
    assert.deepEqual(result.reopened.migrations.at(-1), {
      id: 9,
      name: "daily-water",
    });
  });
});
