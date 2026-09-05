import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteClient as NodeSqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Exit } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { assert, describe, it } from "vitest";
import migration001 from "../src/migrations/001-initial.ts";
import migration002 from "../src/migrations/002-custom-plan-meals.ts";
import migration003 from "../src/migrations/003-body-weight-entries.ts";
import migration004 from "../src/migrations/004-food-measurements.ts";
import migration005 from "../src/migrations/005-food-prices.ts";
import migration006 from "../src/migrations/006-event-tracking.ts";
import migration007 from "../src/migrations/007-fasting-days.ts";
import migration008 from "../src/migrations/008-not-recorded-days.ts";
import migration009 from "../src/migrations/009-daily-water.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import { TestSqliteClientLayer } from "./sqlite-test-layers.ts";

const _seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`PRAGMA foreign_keys = ON`;
  yield* Effect.all([
    migration001,
    migration002,
    migration003,
    migration004,
    migration005,
    migration006,
    migration007,
    migration008,
    migration009,
  ]);
  yield* sql`INSERT INTO plans (id, name, protein_target_grams, carbs_target_grams, fat_target_grams, created_at) VALUES ('plan', 'Travel', 150, 220, 70, 101)`;
  yield* sql`INSERT INTO plan_meals (id, plan_id, name, position, created_at) VALUES ('meal', 'plan', 'Dinner', 0, 102)`;
  yield* sql`INSERT INTO foods (id, name, origin, energy_kcal_per_100g, protein_grams_per_100g, carbs_grams_per_100g, fat_grams_per_100g, created_at, updated_at) VALUES ('food', 'Existing food', 'user', 100, 10, 20, 1, 103, 104)`;
  yield* sql`INSERT INTO daily_logs (date_key, plan_id, mode, water_servings, created_at, updated_at) VALUES ('2026-09-01', 'plan', 'eating', 7, 105, 106)`;
  yield* sql`INSERT INTO active_meal_plan_selections (id, plan_id, updated_at) VALUES ('active-meal-plan', 'plan', 107)`;
  yield* sql`INSERT INTO body_weight_entries (date_key, weight_kilograms, created_at, updated_at) VALUES ('2026-09-01', 70.25, 108, 109)`;
  yield* sql`INSERT INTO meal_entries (rowid, id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, nutrition_multiplier, created_at, updated_at) VALUES (10, 'measured', '2026-09-01', 'meal', 'food', 'measured', 125.5, 'g', 1.255, 110, 111)`;
  yield* sql`INSERT INTO meal_entries (rowid, id, date_key, meal_id, food_id, quantity_kind, quantity_amount, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at) VALUES (30, 'portion', '2026-09-01', 'meal', 'food', 'portion', 2.5, 'portion', 'Old portion snapshot', 35.5, 'g', 0.8875, 110, 113)`;
  yield* sql`CREATE TABLE mai_migrations (migration_id integer PRIMARY KEY NOT NULL, created_at datetime NOT NULL DEFAULT current_timestamp, name VARCHAR(255) NOT NULL)`;
  yield* sql`INSERT INTO mai_migrations (migration_id, name) VALUES (1, 'initial'), (2, 'custom-plan-meals'), (3, 'body-weight-entries'), (4, 'food-measurements'), (5, 'food-prices'), (6, 'event-tracking'), (7, 'fasting-days'), (8, 'not-recorded-days'), (9, 'daily-water')`;
});

const _read = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    entries:
      yield* sql`SELECT rowid, id, date_key, meal_id, food_id, quantity_kind, quantity_amount, quantity_unit, portion_id, portion_name, portion_size_amount, portion_size_unit, nutrition_multiplier, created_at, updated_at FROM meal_entries ORDER BY rowid`,
    related: yield* Effect.all([
      sql`SELECT * FROM foods ORDER BY id`,
      sql`SELECT * FROM plans`,
      sql`SELECT * FROM plan_meals`,
      sql`SELECT * FROM daily_logs`,
      sql`SELECT * FROM active_meal_plan_selections`,
      sql`SELECT * FROM body_weight_entries`,
    ]),
    schema:
      yield* sql`SELECT name, type, sql FROM sqlite_schema WHERE tbl_name IN ('meal_entries', 'next_meal_entries') ORDER BY name`,
    migrations: yield* sql`SELECT * FROM mai_migrations ORDER BY migration_id`,
    foreignKeys: yield* sql`PRAGMA foreign_key_check`,
    integrity: yield* sql`PRAGMA quick_check`,
  };
});

describe("one-off entry migration", () => {
  it("enforces exclusive entry shapes, valid quantities and meal references after migration", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* _seed;
        yield* runSqliteMigrations;
        const before = yield* _read;
        const failures = yield* Effect.all([
          Effect.exit(
            sql`UPDATE meal_entries SET one_off = '{}' WHERE id = 'measured'`
          ),
          Effect.exit(
            sql`UPDATE meal_entries SET kind = 'one-off', one_off = '{}' WHERE id = 'measured'`
          ),
          Effect.exit(
            sql`UPDATE meal_entries SET quantity_amount = -1 WHERE id = 'measured'`
          ),
          Effect.exit(
            sql`UPDATE meal_entries SET quantity_unit = NULL WHERE id = 'measured'`
          ),
          Effect.exit(
            sql`UPDATE meal_entries SET quantity_accuracy = 'invalid' WHERE id = 'measured'`
          ),
          Effect.exit(
            sql`UPDATE meal_entries SET meal_id = 'missing' WHERE id = 'measured'`
          ),
          Effect.exit(
            sql`INSERT INTO meal_entries (id, date_key, meal_id, kind, one_off, created_at, updated_at) VALUES ('invalid-json', '2026-09-01', 'meal', 'one-off', '{', 1, 2)`
          ),
        ]);
        assert.isTrue(failures.every(Exit.isFailure));
        assert.deepEqual(yield* _read, before);
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );
  });

  it("preserves all released fields, portion snapshots, ordering and other stores; repeated startup is idempotent", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* _seed;
        const before = yield* _read;
        yield* runSqliteMigrations;
        const after = yield* _read;
        yield* runSqliteMigrations;
        return {
          before,
          after,
          repeated: yield* _read,
          defaults:
            yield* sql`SELECT kind, quantity_accuracy, one_off FROM meal_entries ORDER BY rowid`,
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );
    assert.deepEqual(result.after.entries, result.before.entries);
    assert.deepEqual(result.after.related, result.before.related);
    assert.deepEqual(result.after, result.repeated);
    assert.deepEqual(result.defaults, [
      { kind: "catalog", quantity_accuracy: "unspecified", one_off: null },
      { kind: "catalog", quantity_accuracy: "unspecified", one_off: null },
    ]);
    assert.deepEqual(result.after.foreignKeys, []);
    assert.deepEqual(result.after.integrity, [{ quick_check: "ok" }]);
    assert.equal(result.after.migrations.length, 10);
    assert.equal(result.after.schema.length, 7);
  });

  it("restores the original schema and every value if the final ledger write fails, then retries successfully", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* _seed;
        const before = yield* _read;
        yield* sql`CREATE TRIGGER fail_migration BEFORE INSERT ON mai_migrations WHEN NEW.migration_id = 10 BEGIN SELECT RAISE(ABORT, 'forced ledger failure'); END`;
        const failed = yield* Effect.exit(runSqliteMigrations);
        const after = yield* _read;
        yield* sql`DROP TRIGGER fail_migration`;
        yield* runSqliteMigrations;
        return { before, after, failed, retry: yield* _read };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );
    assert.isTrue(Exit.isFailure(result.failed));
    assert.deepEqual(result.before, result.after);
    assert.deepEqual(result.before.entries, result.retry.entries);
    assert.equal(result.retry.migrations.length, 10);
  });

  it("retains the migrated data after closing and reopening the physical database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mai-one-off-migration-"));
    const filename = join(directory, "mai.sqlite");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const initial = yield* Effect.gen(function* () {
          yield* _seed;
          yield* runSqliteMigrations;
          return yield* _read;
        }).pipe(
          Effect.provide(NodeSqliteClient.layer({ filename, disableWAL: true }))
        );
        const reopened = yield* Effect.gen(function* () {
          yield* runSqliteMigrations;
          return yield* _read;
        }).pipe(
          Effect.provide(NodeSqliteClient.layer({ filename, disableWAL: true }))
        );
        return { initial, reopened };
      }).pipe(
        Effect.ensuring(
          Effect.tryPromise(() =>
            rm(directory, { recursive: true, force: true })
          ).pipe(Effect.orDie)
        )
      )
    );
    assert.deepEqual(result.initial, result.reopened);
  });
});
