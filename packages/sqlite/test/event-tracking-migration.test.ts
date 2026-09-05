import { Effect, Schema } from "effect";
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
  name: Schema.String,
});

const ForeignKeyRow = Schema.Struct({
  onDelete: Schema.String,
  onUpdate: Schema.String,
  sourceColumn: Schema.String,
  targetColumn: Schema.String,
  targetTable: Schema.String,
});

const BodyWeightEntryRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Schema.String,
  updatedAt: Schema.Number,
  weightKilograms: Schema.Number,
});

const RecordedEventRow = Schema.Struct({
  id: Schema.String,
  occurredAt: Schema.NullOr(Schema.Number),
});

const CountRow = Schema.Struct({ count: Schema.Number });

const recordableEventId = "11111111-1111-4111-8111-111111111111";
const firstRecordedEventId = "22222222-2222-4222-8222-222222222222";
const secondRecordedEventId = "33333333-3333-4333-8333-333333333333";

const _listMigrations = Effect.fn("_listMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
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

  return yield* listMigrations({});
});

const _readBodyWeightEntry = Effect.fn("_readBodyWeightEntry")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const findBodyWeightEntry = SqlSchema.findOne({
    Request: EmptyRequest,
    Result: BodyWeightEntryRow,
    execute: () =>
      sql`
        SELECT
          date_key AS dateKey,
          weight_kilograms AS weightKilograms,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM body_weight_entries
        WHERE date_key = '2026-07-31'
      `,
  });

  return yield* findBodyWeightEntry({});
});

const _seedReleasedVersion5Database = Effect.fn(
  "_seedReleasedVersion5Database"
)(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* migration001;
  yield* migration002;
  yield* migration003;
  yield* migration004;
  yield* migration005;

  yield* sql`
    INSERT INTO body_weight_entries ${sql.insert({
      created_at: 100,
      date_key: "2026-07-31",
      updated_at: 110,
      weight_kilograms: 82.4,
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
      (5, 'food-prices')
  `;
});

describe("event tracking SQLite migration", () => {
  it("creates the fresh event schema, indexes, and restrictive foreign key", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* runSqliteMigrations;

        const listSchemaObjects = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: SchemaObjectRow,
          execute: () =>
            sql`
              SELECT name, sql, type
              FROM sqlite_schema
              WHERE name IN (
                'recordable_events',
                'recordable_events_active_by_position',
                'recordable_events_unique_name',
                'recorded_events',
                'recorded_events_by_date',
                'recorded_events_by_recordable_event'
              )
              ORDER BY name
            `,
        });
        const listRecordableEventColumns = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: TableColumnRow,
          execute: () =>
            sql`
              SELECT name
              FROM pragma_table_info('recordable_events')
              ORDER BY cid
            `,
        });
        const listRecordedEventColumns = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: TableColumnRow,
          execute: () =>
            sql`
              SELECT name
              FROM pragma_table_info('recorded_events')
              ORDER BY cid
            `,
        });
        const listRecordedEventForeignKeys = SqlSchema.findAll({
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
              FROM pragma_foreign_key_list('recorded_events')
            `,
        });

        return {
          foreignKeys: yield* listRecordedEventForeignKeys({}),
          migrations: yield* _listMigrations(),
          recordableEventColumns: yield* listRecordableEventColumns({}),
          recordedEventColumns: yield* listRecordedEventColumns({}),
          schemaObjects: yield* listSchemaObjects({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepStrictEqual(result.migrations, [
      { id: 1, name: "initial" },
      { id: 2, name: "custom-plan-meals" },
      { id: 3, name: "body-weight-entries" },
      { id: 4, name: "food-measurements" },
      { id: 5, name: "food-prices" },
      { id: 6, name: "event-tracking" },
      { id: 7, name: "fasting-days" },
      { id: 8, name: "not-recorded-days" },
      { id: 9, name: "daily-water" },
      { id: 10, name: "one-off-meal-entries" },
    ]);
    assert.deepStrictEqual(
      result.schemaObjects.map(({ name, type }) => ({ name, type })),
      [
        { name: "recordable_events", type: "table" },
        {
          name: "recordable_events_active_by_position",
          type: "index",
        },
        { name: "recordable_events_unique_name", type: "index" },
        { name: "recorded_events", type: "table" },
        { name: "recorded_events_by_date", type: "index" },
        {
          name: "recorded_events_by_recordable_event",
          type: "index",
        },
      ]
    );
    assert.deepStrictEqual(
      result.recordableEventColumns.map(({ name }) => name),
      [
        "id",
        "name",
        "name_key",
        "emoji",
        "position",
        "archived_at",
        "created_at",
        "updated_at",
      ]
    );
    assert.deepStrictEqual(
      result.recordedEventColumns.map(({ name }) => name),
      [
        "id",
        "recordable_event_id",
        "date_key",
        "occurred_at",
        "created_at",
        "updated_at",
      ]
    );
    assert.deepStrictEqual(result.foreignKeys, [
      {
        onDelete: "RESTRICT",
        onUpdate: "RESTRICT",
        sourceColumn: "recordable_event_id",
        targetColumn: "id",
        targetTable: "recordable_events",
      },
    ]);
    assert.include(
      result.schemaObjects.find(
        ({ name }) => name === "recordable_events_active_by_position"
      )?.sql ?? "",
      "WHERE archived_at IS NULL"
    );
  });

  it("preserves released migration 5 data and is idempotent through the registry", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* _seedReleasedVersion5Database();

        const before = yield* _readBodyWeightEntry();
        yield* runSqliteMigrations;
        const firstStartup = {
          bodyWeightEntry: yield* _readBodyWeightEntry(),
          migrations: yield* _listMigrations(),
        };
        yield* runSqliteMigrations;
        const secondStartup = {
          bodyWeightEntry: yield* _readBodyWeightEntry(),
          migrations: yield* _listMigrations(),
        };

        return { before, firstStartup, secondStartup };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepStrictEqual(result.firstStartup, result.secondStartup);
    assert.deepStrictEqual(result.firstStartup.bodyWeightEntry, result.before);
    assert.deepStrictEqual(result.firstStartup.migrations, [
      { id: 1, name: "initial" },
      { id: 2, name: "custom-plan-meals" },
      { id: 3, name: "body-weight-entries" },
      { id: 4, name: "food-measurements" },
      { id: 5, name: "food-prices" },
      { id: 6, name: "event-tracking" },
      { id: 7, name: "fasting-days" },
      { id: 8, name: "not-recorded-days" },
      { id: 9, name: "daily-water" },
      { id: 10, name: "one-off-meal-entries" },
    ]);
  });

  it("preserves populated event tables on a version 8 restart", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* runSqliteMigrations;
        yield* sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            ${recordableEventId},
            'Water',
            'water',
            '💧',
            0,
            NULL,
            100,
            100
          )
        `;
        yield* sql`
          INSERT INTO recorded_events (
            id,
            recordable_event_id,
            date_key,
            occurred_at,
            created_at,
            updated_at
          ) VALUES (
            ${firstRecordedEventId},
            ${recordableEventId},
            '2026-07-31',
            110,
            110,
            110
          )
        `;

        yield* runSqliteMigrations;

        const countRecordableEvents = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: CountRow,
          execute: () => sql`SELECT COUNT(*) AS count FROM recordable_events`,
        });
        const countRecordedEvents = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: CountRow,
          execute: () => sql`SELECT COUNT(*) AS count FROM recorded_events`,
        });

        return {
          recordableEventCount: (yield* countRecordableEvents({})).count,
          recordedEventCount: (yield* countRecordedEvents({})).count,
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.equal(result.recordableEventCount, 1);
    assert.equal(result.recordedEventCount, 1);
  });

  it("honors a legacy reset by clearing exact orphaned event tables", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* runSqliteMigrations;
        yield* sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            ${recordableEventId},
            'Water',
            'water',
            '💧',
            0,
            NULL,
            100,
            100
          )
        `;
        yield* sql`
          INSERT INTO recorded_events (
            id,
            recordable_event_id,
            date_key,
            occurred_at,
            created_at,
            updated_at
          ) VALUES (
            ${firstRecordedEventId},
            ${recordableEventId},
            '2026-07-31',
            110,
            110,
            110
          )
        `;

        yield* sql`PRAGMA foreign_keys = OFF`;
        yield* sql`DROP TABLE meal_entries`;
        yield* sql`DROP TABLE body_weight_entries`;
        yield* sql`DROP TABLE active_meal_plan_selections`;
        yield* sql`DROP TABLE daily_logs`;
        yield* sql`DROP TABLE plan_meals`;
        yield* sql`DROP TABLE food_prices`;
        yield* sql`DROP TABLE food_portions`;
        yield* sql`DROP TABLE foods`;
        yield* sql`DROP TABLE plans`;
        yield* sql`DROP TABLE mai_migrations`;
        yield* sql`PRAGMA foreign_keys = ON`;

        yield* runSqliteMigrations;

        const countRecordableEvents = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: CountRow,
          execute: () => sql`SELECT COUNT(*) AS count FROM recordable_events`,
        });
        const countRecordedEvents = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: CountRow,
          execute: () => sql`SELECT COUNT(*) AS count FROM recorded_events`,
        });

        return {
          migrations: yield* _listMigrations(),
          recordableEventCount: (yield* countRecordableEvents({})).count,
          recordedEventCount: (yield* countRecordedEvents({})).count,
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.equal(result.recordableEventCount, 0);
    assert.equal(result.recordedEventCount, 0);
    assert.deepStrictEqual(result.migrations, [
      { id: 1, name: "initial" },
      { id: 2, name: "custom-plan-meals" },
      { id: 3, name: "body-weight-entries" },
      { id: 4, name: "food-measurements" },
      { id: 5, name: "food-prices" },
      { id: 6, name: "event-tracking" },
      { id: 7, name: "fasting-days" },
      { id: 8, name: "not-recorded-days" },
      { id: 9, name: "daily-water" },
      { id: 10, name: "one-off-meal-entries" },
    ]);
  });

  it("enforces checks and references while allowing repeated events per day", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* runSqliteMigrations;

        yield* Effect.flip(sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            '44444444-4444-4444-8444-444444444444',
            '   ',
            'blank',
            '💧',
            0,
            NULL,
            100,
            100
          )
        `);
        yield* Effect.flip(sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            '55555555-5555-4555-8555-555555555555',
            'Water',
            'water',
            '',
            0,
            NULL,
            100,
            100
          )
        `);
        yield* Effect.flip(sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            '66666666-6666-4666-8666-666666666666',
            'Water',
            'water',
            '💧',
            -1,
            NULL,
            100,
            100
          )
        `);
        yield* Effect.flip(sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            '77777777-7777-4777-8777-777777777777',
            'Water',
            'water',
            '💧',
            0,
            120,
            100,
            110
          )
        `);

        yield* sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            ${recordableEventId},
            'Water',
            'water',
            '💧',
            0,
            NULL,
            100,
            100
          )
        `;
        yield* Effect.flip(sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'water',
            'water',
            '🚰',
            1,
            NULL,
            100,
            100
          )
        `);

        yield* Effect.flip(sql`
          INSERT INTO recorded_events (
            id,
            recordable_event_id,
            date_key,
            occurred_at,
            created_at,
            updated_at
          ) VALUES (
            '88888888-8888-4888-8888-888888888888',
            ${recordableEventId},
            '2026/07/31',
            NULL,
            200,
            200
          )
        `);
        yield* Effect.flip(sql`
          INSERT INTO recorded_events (
            id,
            recordable_event_id,
            date_key,
            occurred_at,
            created_at,
            updated_at
          ) VALUES (
            '99999999-9999-4999-8999-999999999999',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '2026-07-31',
            NULL,
            200,
            200
          )
        `);

        yield* sql`
          INSERT INTO recorded_events (
            id,
            recordable_event_id,
            date_key,
            occurred_at,
            created_at,
            updated_at
          ) VALUES (
            ${firstRecordedEventId},
            ${recordableEventId},
            '2026-07-31',
            210,
            220,
            220
          )
        `;
        yield* sql`
          INSERT INTO recorded_events (
            id,
            recordable_event_id,
            date_key,
            occurred_at,
            created_at,
            updated_at
          ) VALUES (
            ${secondRecordedEventId},
            ${recordableEventId},
            '2026-07-31',
            NULL,
            230,
            230
          )
        `;

        yield* Effect.flip(
          sql`DELETE FROM recordable_events WHERE id = ${recordableEventId}`
        );

        const listRecordedEvents = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: RecordedEventRow,
          execute: () =>
            sql`
              SELECT id, occurred_at AS occurredAt
              FROM recorded_events
              WHERE date_key = '2026-07-31'
              ORDER BY occurred_at DESC, created_at DESC, id
            `,
        });
        const countRecordableEvents = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: CountRow,
          execute: () =>
            sql`
              SELECT COUNT(*) AS count
              FROM recordable_events
              WHERE id = ${recordableEventId}
            `,
        });

        return {
          recordableEventCount: (yield* countRecordableEvents({})).count,
          recordedEvents: yield* listRecordedEvents({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.equal(result.recordableEventCount, 1);
    assert.deepStrictEqual(result.recordedEvents, [
      { id: firstRecordedEventId, occurredAt: 210 },
      { id: secondRecordedEventId, occurredAt: null },
    ]);
  });

  it("rolls back partial schema changes when migration 6 fails", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* _seedReleasedVersion5Database();
        yield* sql`CREATE TABLE recorded_events (sentinel TEXT)`;

        yield* Effect.flip(runSqliteMigrations);

        const listEventSchemaObjects = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: SchemaObjectRow,
          execute: () =>
            sql`
              SELECT name, sql, type
              FROM sqlite_schema
              WHERE name IN (
                'recordable_events',
                'recordable_events_active_by_position',
                'recorded_events'
              )
              ORDER BY name
            `,
        });
        const listRecordedEventColumns = SqlSchema.findAll({
          Request: EmptyRequest,
          Result: TableColumnRow,
          execute: () =>
            sql`
              SELECT name
              FROM pragma_table_info('recorded_events')
              ORDER BY cid
            `,
        });

        return {
          bodyWeightEntry: yield* _readBodyWeightEntry(),
          eventSchemaObjects: yield* listEventSchemaObjects({}),
          migrations: yield* _listMigrations(),
          recordedEventColumns: yield* listRecordedEventColumns({}),
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.deepStrictEqual(result.migrations, [
      { id: 1, name: "initial" },
      { id: 2, name: "custom-plan-meals" },
      { id: 3, name: "body-weight-entries" },
      { id: 4, name: "food-measurements" },
      { id: 5, name: "food-prices" },
    ]);
    assert.deepStrictEqual(
      result.eventSchemaObjects.map(({ name, type }) => ({ name, type })),
      [{ name: "recorded_events", type: "table" }]
    );
    assert.deepStrictEqual(
      result.recordedEventColumns.map(({ name }) => name),
      ["sentinel"]
    );
    assert.deepStrictEqual(result.bodyWeightEntry, {
      createdAt: 100,
      dateKey: "2026-07-31",
      updatedAt: 110,
      weightKilograms: 82.4,
    });
  });

  it("does not clear a near-match orphan schema", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* _seedReleasedVersion5Database();
        yield* migration006;
        yield* sql`
          INSERT INTO recordable_events (
            id,
            name,
            name_key,
            emoji,
            position,
            archived_at,
            created_at,
            updated_at
          ) VALUES (
            ${recordableEventId},
            'Water',
            'water',
            '💧',
            0,
            NULL,
            100,
            100
          )
        `;
        yield* sql`DROP INDEX recorded_events_by_date`;
        yield* sql`
          CREATE INDEX recorded_events_by_date
          ON recorded_events(created_at DESC, date_key DESC, occurred_at DESC, id)
        `;

        yield* Effect.flip(runSqliteMigrations);

        const countRecordableEvents = SqlSchema.findOne({
          Request: EmptyRequest,
          Result: CountRow,
          execute: () => sql`SELECT COUNT(*) AS count FROM recordable_events`,
        });

        return {
          migrations: yield* _listMigrations(),
          recordableEventCount: (yield* countRecordableEvents({})).count,
        };
      }).pipe(Effect.provide(TestSqliteClientLayer))
    );

    assert.equal(result.recordableEventCount, 1);
    assert.deepStrictEqual(result.migrations, [
      { id: 1, name: "initial" },
      { id: 2, name: "custom-plan-meals" },
      { id: 3, name: "body-weight-entries" },
      { id: 4, name: "food-measurements" },
      { id: 5, name: "food-prices" },
    ]);
  });
});
