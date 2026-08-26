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
import migration007 from "../src/migrations/007-fasting-days.ts";
import migration008 from "../src/migrations/008-not-recorded-days.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import { TestSqliteClientLayer } from "./sqlite-test-layers.ts";

const EmptyRequest = Schema.Struct({});

const DailyWaterRow = Schema.Struct({
  waterServings: Schema.NullOr(Schema.Number),
});

const MigrationRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});

const TableColumnRow = Schema.Struct({
  defaultValue: Schema.NullOr(Schema.String),
  isNotNull: Schema.Number,
  name: Schema.String,
  type: Schema.String,
});

describe("daily water SQLite migration", () => {
  it("preserves an empty recording and enforces whole non-negative servings", async () => {
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
        yield* migration007;
        yield* migration008;
        yield* sql`
          INSERT INTO plans ${sql.insert({
            carbs_target_grams: 200,
            created_at: 100,
            fat_target_grams: 70,
            id: "11111111-1111-4111-8111-111111111111",
            name: "Water migration plan",
            protein_target_grams: 150,
          })}
        `;
        yield* sql`
          INSERT INTO daily_logs ${sql.insert({
            created_at: 101,
            date_key: "2026-08-26",
            mode: "eating",
            plan_id: "11111111-1111-4111-8111-111111111111",
            updated_at: 102,
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
            (6, 'event-tracking'),
            (7, 'fasting-days'),
            (8, 'not-recorded-days')
        `;

        yield* runSqliteMigrations;

        const findWater = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: DailyWaterRow,
          execute: () =>
            sql`
              SELECT water_servings AS waterServings
              FROM daily_logs
              WHERE date_key = '2026-08-26'
            `,
        });
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
        const initial = yield* findWater({});
        const negativeExit = yield* Effect.exit(
          sql`UPDATE daily_logs SET water_servings = -1`
        );
        const fractionalExit = yield* Effect.exit(
          sql`UPDATE daily_logs SET water_servings = 1.5`
        );
        yield* sql`UPDATE daily_logs SET water_servings = 0`;
        const explicitZero = yield* findWater({});
        yield* sql`UPDATE daily_logs SET water_servings = 8`;
        const twoLiters = yield* findWater({});
        yield* sql`UPDATE daily_logs SET water_servings = NULL`;
        const cleared = yield* findWater({});
        yield* runSqliteMigrations;

        return {
          cleared,
          columns: yield* listColumns({}),
          explicitZero,
          fractionalExit,
          initial,
          migrations: yield* listMigrations({}),
          negativeExit,
          twoLiters,
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.isNull(result.initial.waterServings);
    assert.equal(result.explicitZero.waterServings, 0);
    assert.equal(result.twoLiters.waterServings, 8);
    assert.isNull(result.cleared.waterServings);
    assert.isTrue(Exit.isFailure(result.negativeExit));
    assert.isTrue(Exit.isFailure(result.fractionalExit));
    assert.deepEqual(
      result.columns.find(({ name }) => name === "water_servings"),
      {
        defaultValue: "NULL",
        isNotNull: 0,
        name: "water_servings",
        type: "INTEGER",
      }
    );
    assert.deepEqual(result.migrations.at(-1), {
      id: 9,
      name: "daily-water",
    });
    assert.equal(result.migrations.filter(({ id }) => id === 9).length, 1);
  });
});
