import { Array, Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const EmptyRequest = Schema.Struct({});

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

const IndexRow = Schema.Struct({
  isPartial: Schema.Number,
  isUnique: Schema.Number,
  name: Schema.String,
});

const ForeignKeyRow = Schema.Struct({
  onDelete: Schema.String,
  onUpdate: Schema.String,
  sourceColumn: Schema.String,
  targetColumn: Schema.String,
  targetTable: Schema.String,
});

const IndexColumnRow = Schema.Struct({
  columnName: Schema.String,
  indexName: Schema.String,
  position: Schema.Number,
});

const _canonicalSql = ({ sql }: { readonly sql: string }): string =>
  sql.replace(/\s+/g, "").toLowerCase();

const _sameTableColumns = ({
  actual,
  expected,
}: {
  readonly actual: readonly (typeof TableColumnRow.Type)[];
  readonly expected: readonly (typeof TableColumnRow.Type)[];
}): boolean =>
  actual.length === expected.length &&
  actual.every((column, index) => {
    const expectedColumn = expected[index];

    return (
      expectedColumn !== undefined &&
      column.defaultValue === expectedColumn.defaultValue &&
      column.isNotNull === expectedColumn.isNotNull &&
      column.name === expectedColumn.name &&
      column.primaryKey === expectedColumn.primaryKey &&
      column.type === expectedColumn.type
    );
  });

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;

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
          'recordable_events_unique_name',
          'recorded_events',
          'recorded_events_by_date',
          'recorded_events_by_recordable_event'
        )
        ORDER BY name
      `,
  });
  const schemaObjects = yield* listEventSchemaObjects({});

  if (Array.isReadonlyArrayNonEmpty(schemaObjects)) {
    const listRecordableEventColumns = SqlSchema.findAll({
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
          FROM pragma_table_info('recordable_events')
          ORDER BY cid
        `,
    });
    const listRecordedEventColumns = SqlSchema.findAll({
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
          FROM pragma_table_info('recorded_events')
          ORDER BY cid
        `,
    });
    const listRecordableEventIndexes = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: IndexRow,
      execute: () =>
        sql`
          SELECT
            name,
            "unique" AS isUnique,
            partial AS isPartial
          FROM pragma_index_list('recordable_events')
          WHERE name NOT LIKE 'sqlite_autoindex_%'
          ORDER BY name
        `,
    });
    const listRecordedEventIndexes = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: IndexRow,
      execute: () =>
        sql`
          SELECT
            name,
            "unique" AS isUnique,
            partial AS isPartial
          FROM pragma_index_list('recorded_events')
          WHERE name NOT LIKE 'sqlite_autoindex_%'
          ORDER BY name
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
    const listEventIndexColumns = SqlSchema.findAll({
      Request: EmptyRequest,
      Result: IndexColumnRow,
      execute: () =>
        sql`
          SELECT
            'recordable_events_active_by_position' AS indexName,
            seqno AS position,
            name AS columnName
          FROM pragma_index_info('recordable_events_active_by_position')
          UNION ALL
          SELECT
            'recordable_events_unique_name' AS indexName,
            seqno AS position,
            name AS columnName
          FROM pragma_index_info('recordable_events_unique_name')
          UNION ALL
          SELECT
            'recorded_events_by_date' AS indexName,
            seqno AS position,
            name AS columnName
          FROM pragma_index_info('recorded_events_by_date')
          UNION ALL
          SELECT
            'recorded_events_by_recordable_event' AS indexName,
            seqno AS position,
            name AS columnName
          FROM pragma_index_info('recorded_events_by_recordable_event')
          ORDER BY indexName, position
        `,
    });
    const recordableEventColumns = yield* listRecordableEventColumns({});
    const recordedEventColumns = yield* listRecordedEventColumns({});
    const recordableEventIndexes = yield* listRecordableEventIndexes({});
    const recordedEventIndexes = yield* listRecordedEventIndexes({});
    const recordedEventForeignKeys = yield* listRecordedEventForeignKeys({});
    const eventIndexColumns = yield* listEventIndexColumns({});
    const recordableEventTableSql =
      schemaObjects.find(({ name }) => name === "recordable_events")?.sql ?? "";
    const recordedEventTableSql =
      schemaObjects.find(({ name }) => name === "recorded_events")?.sql ?? "";
    const hasExactSchemaObjects =
      schemaObjects.length === 6 &&
      schemaObjects.every(({ name, type }, index) => {
        const expected = [
          ["recordable_events", "table"],
          ["recordable_events_active_by_position", "index"],
          ["recordable_events_unique_name", "index"],
          ["recorded_events", "table"],
          ["recorded_events_by_date", "index"],
          ["recorded_events_by_recordable_event", "index"],
        ] as const;

        return expected[index]?.[0] === name && expected[index]?.[1] === type;
      });
    const hasExactRecordableEventColumns = _sameTableColumns({
      actual: recordableEventColumns,
      expected: [
        {
          defaultValue: null,
          isNotNull: 1,
          name: "id",
          primaryKey: 1,
          type: "TEXT",
        },
        {
          defaultValue: null,
          isNotNull: 1,
          name: "name",
          primaryKey: 0,
          type: "TEXT",
        },
        {
          defaultValue: null,
          isNotNull: 1,
          name: "name_key",
          primaryKey: 0,
          type: "TEXT",
        },
        {
          defaultValue: null,
          isNotNull: 1,
          name: "emoji",
          primaryKey: 0,
          type: "TEXT",
        },
        {
          defaultValue: null,
          isNotNull: 1,
          name: "position",
          primaryKey: 0,
          type: "INTEGER",
        },
        {
          defaultValue: null,
          isNotNull: 0,
          name: "archived_at",
          primaryKey: 0,
          type: "INTEGER",
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
      ],
    });
    const hasExactRecordedEventColumns = _sameTableColumns({
      actual: recordedEventColumns,
      expected: [
        {
          defaultValue: null,
          isNotNull: 1,
          name: "id",
          primaryKey: 1,
          type: "TEXT",
        },
        {
          defaultValue: null,
          isNotNull: 1,
          name: "recordable_event_id",
          primaryKey: 0,
          type: "TEXT",
        },
        {
          defaultValue: null,
          isNotNull: 1,
          name: "date_key",
          primaryKey: 0,
          type: "TEXT",
        },
        {
          defaultValue: null,
          isNotNull: 0,
          name: "occurred_at",
          primaryKey: 0,
          type: "INTEGER",
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
      ],
    });
    const hasExactIndexes =
      recordableEventIndexes.length === 2 &&
      recordableEventIndexes[0]?.name ===
        "recordable_events_active_by_position" &&
      recordableEventIndexes[0].isPartial === 1 &&
      recordableEventIndexes[0].isUnique === 0 &&
      recordableEventIndexes[1]?.name === "recordable_events_unique_name" &&
      recordableEventIndexes[1].isPartial === 0 &&
      recordableEventIndexes[1].isUnique === 1 &&
      recordedEventIndexes.length === 2 &&
      recordedEventIndexes[0]?.name === "recorded_events_by_date" &&
      recordedEventIndexes[0].isPartial === 0 &&
      recordedEventIndexes[0].isUnique === 0 &&
      recordedEventIndexes[1]?.name === "recorded_events_by_recordable_event" &&
      recordedEventIndexes[1].isPartial === 0 &&
      recordedEventIndexes[1].isUnique === 0;
    const expectedIndexColumns = [
      {
        columnName: "position",
        indexName: "recordable_events_active_by_position",
        position: 0,
      },
      {
        columnName: "created_at",
        indexName: "recordable_events_active_by_position",
        position: 1,
      },
      {
        columnName: "id",
        indexName: "recordable_events_active_by_position",
        position: 2,
      },
      {
        columnName: "name_key",
        indexName: "recordable_events_unique_name",
        position: 0,
      },
      {
        columnName: "date_key",
        indexName: "recorded_events_by_date",
        position: 0,
      },
      {
        columnName: "occurred_at",
        indexName: "recorded_events_by_date",
        position: 1,
      },
      {
        columnName: "created_at",
        indexName: "recorded_events_by_date",
        position: 2,
      },
      {
        columnName: "id",
        indexName: "recorded_events_by_date",
        position: 3,
      },
      {
        columnName: "recordable_event_id",
        indexName: "recorded_events_by_recordable_event",
        position: 0,
      },
      {
        columnName: "date_key",
        indexName: "recorded_events_by_recordable_event",
        position: 1,
      },
      {
        columnName: "occurred_at",
        indexName: "recorded_events_by_recordable_event",
        position: 2,
      },
      {
        columnName: "created_at",
        indexName: "recorded_events_by_recordable_event",
        position: 3,
      },
      {
        columnName: "id",
        indexName: "recorded_events_by_recordable_event",
        position: 4,
      },
    ] satisfies readonly (typeof IndexColumnRow.Type)[];
    const hasExactIndexColumns =
      eventIndexColumns.length === expectedIndexColumns.length &&
      eventIndexColumns.every((column, index) => {
        const expectedColumn = expectedIndexColumns[index];

        return (
          expectedColumn !== undefined &&
          column.columnName === expectedColumn.columnName &&
          column.indexName === expectedColumn.indexName &&
          column.position === expectedColumn.position
        );
      });
    const hasExactForeignKey =
      recordedEventForeignKeys.length === 1 &&
      recordedEventForeignKeys[0]?.sourceColumn === "recordable_event_id" &&
      recordedEventForeignKeys[0].targetColumn === "id" &&
      recordedEventForeignKeys[0].targetTable === "recordable_events" &&
      recordedEventForeignKeys[0].onDelete === "RESTRICT" &&
      recordedEventForeignKeys[0].onUpdate === "RESTRICT";
    const activePositionIndexSql = _canonicalSql({
      sql:
        schemaObjects.find(
          ({ name }) => name === "recordable_events_active_by_position"
        )?.sql ?? "",
    });
    const uniqueNameIndexSql = _canonicalSql({
      sql:
        schemaObjects.find(
          ({ name }) => name === "recordable_events_unique_name"
        )?.sql ?? "",
    });
    const recordedByDateIndexSql = _canonicalSql({
      sql:
        schemaObjects.find(({ name }) => name === "recorded_events_by_date")
          ?.sql ?? "",
    });
    const recordedByDefinitionIndexSql = _canonicalSql({
      sql:
        schemaObjects.find(
          ({ name }) => name === "recorded_events_by_recordable_event"
        )?.sql ?? "",
    });
    const hasExactSql =
      _canonicalSql({ sql: recordableEventTableSql }) ===
        "createtablerecordable_events(idtextprimarykeynotnull,nametextnotnullcheck(length(trim(name))>0),name_keytextnotnullcheck(length(name_key)>0),emojitextnotnullcheck(length(trim(emoji))>0),positionintegernotnullcheck(position>=0),archived_atinteger,created_atintegernotnull,updated_atintegernotnull,check(updated_at>=created_at),check(archived_atisnullor(archived_at>=created_atandarchived_at<=updated_at)))" &&
      _canonicalSql({ sql: recordedEventTableSql }) ===
        "createtablerecorded_events(idtextprimarykeynotnull,recordable_event_idtextnotnull,date_keytextnotnullcheck(length(date_key)=10anddate_keyglob'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),occurred_atinteger,created_atintegernotnull,updated_atintegernotnull,check(updated_at>=created_at),foreignkey(recordable_event_id)referencesrecordable_events(id)onupdaterestrictondeleterestrictdeferrableinitiallydeferred)" &&
      activePositionIndexSql ===
        "createindexrecordable_events_active_by_positiononrecordable_events(position,created_at,id)wherearchived_atisnull" &&
      uniqueNameIndexSql ===
        "createuniqueindexrecordable_events_unique_nameonrecordable_events(name_key)" &&
      recordedByDateIndexSql ===
        "createindexrecorded_events_by_dateonrecorded_events(date_keydesc,occurred_atdesc,created_atdesc,id)" &&
      recordedByDefinitionIndexSql ===
        "createindexrecorded_events_by_recordable_eventonrecorded_events(recordable_event_id,date_keydesc,occurred_atdesc,created_atdesc,id)";

    if (
      !hasExactSchemaObjects ||
      !hasExactRecordableEventColumns ||
      !hasExactRecordedEventColumns ||
      !hasExactIndexes ||
      !hasExactIndexColumns ||
      !hasExactForeignKey ||
      !hasExactSql
    ) {
      return yield* Effect.fail(
        "Event tracking migration found an unexpected existing schema."
      );
    }

    yield* sql`DROP TABLE recorded_events`;
    yield* sql`DROP TABLE recordable_events`;
  }

  yield* sql`
    CREATE TABLE recordable_events (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      name_key TEXT NOT NULL CHECK (length(name_key) > 0),
      emoji TEXT NOT NULL CHECK (length(trim(emoji)) > 0),
      position INTEGER NOT NULL CHECK (position >= 0),
      archived_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (updated_at >= created_at),
      CHECK (
        archived_at IS NULL OR
        (archived_at >= created_at AND archived_at <= updated_at)
      )
    )
  `;

  yield* sql`
    CREATE INDEX recordable_events_active_by_position
    ON recordable_events(position, created_at, id)
    WHERE archived_at IS NULL
  `;

  yield* sql`
    CREATE UNIQUE INDEX recordable_events_unique_name
    ON recordable_events(name_key)
  `;

  yield* sql`
    CREATE TABLE recorded_events (
      id TEXT PRIMARY KEY NOT NULL,
      recordable_event_id TEXT NOT NULL,
      date_key TEXT NOT NULL CHECK (
        length(date_key) = 10 AND
        date_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      ),
      occurred_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (updated_at >= created_at),
      FOREIGN KEY (recordable_event_id)
        REFERENCES recordable_events(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
    )
  `;

  yield* sql`
    CREATE INDEX recorded_events_by_date
    ON recorded_events(date_key DESC, occurred_at DESC, created_at DESC, id)
  `;

  yield* sql`
    CREATE INDEX recorded_events_by_recordable_event
    ON recorded_events(
      recordable_event_id,
      date_key DESC,
      occurred_at DESC,
      created_at DESC,
      id
    )
  `;
});
