import * as Domain from "@mai/event-tracking/domain";
import * as Store from "@mai/event-tracking/services/store";
import { Array, Data, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const EmptyRequest = Schema.Struct({});

const RecordableEventRow = Schema.Struct({
  archivedAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  emoji: Domain.EventEmoji,
  id: Domain.RecordableEventId,
  name: Domain.RecordableEventName,
  position: Domain.RecordableEventPosition,
  updatedAt: Schema.Number,
});

const RecordedEventRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Domain.DateKey,
  id: Domain.RecordedEventId,
  occurredAt: Schema.NullOr(Schema.Number),
  recordableEventId: Domain.RecordableEventId,
  updatedAt: Schema.Number,
});

const RecentRecordedEventsRequest = Schema.Struct({
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

const MissingRecordableEventReferenceRow = Schema.Struct({
  recordableEventId: Domain.RecordableEventId,
  recordedEventId: Domain.RecordedEventId,
});

class _MissingRecordableEventReference extends Data.TaggedError(
  "MissingRecordableEventReference"
)<{
  readonly recordableEventId: Domain.RecordableEventId;
  readonly recordedEventId: Domain.RecordedEventId;
}> {}

const _mapStoreError = <Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>
) =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new Store.EventTrackingStoreError({
          cause,
        })
    )
  );

export const makeSqliteEventTrackingStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;

  const listRecordableEventRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: RecordableEventRow,
    execute: () =>
      sql`
        SELECT
          id,
          name,
          emoji,
          position,
          archived_at AS archivedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM recordable_events
        ORDER BY position, created_at, id
      `,
  });
  const findRecordableEventByIdRows = SqlSchema.findAll({
    Request: Domain.RecordableEventId,
    Result: RecordableEventRow,
    execute: (recordableEventId) =>
      sql`
        SELECT
          id,
          name,
          emoji,
          position,
          archived_at AS archivedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM recordable_events
        WHERE id = ${recordableEventId}
      `,
  });
  const findRecordableEventsByNameRows = SqlSchema.findAll({
    Request: Domain.RecordableEventName,
    Result: RecordableEventRow,
    execute: (name) =>
      sql`
        SELECT
          id,
          name,
          emoji,
          position,
          archived_at AS archivedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM recordable_events
        WHERE name_key = ${Domain.recordableEventNameKey({ name })}
        ORDER BY position, created_at, id
      `,
  });
  const listRecordedEventRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: RecordedEventRow,
    execute: () =>
      sql`
        SELECT
          id,
          recordable_event_id AS recordableEventId,
          date_key AS dateKey,
          occurred_at AS occurredAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM recorded_events
        ORDER BY
          date_key DESC,
          occurred_at IS NULL,
          occurred_at DESC,
          created_at DESC,
          id DESC
      `,
  });
  const findRecordedEventByIdRows = SqlSchema.findAll({
    Request: Domain.RecordedEventId,
    Result: RecordedEventRow,
    execute: (recordedEventId) =>
      sql`
        SELECT
          id,
          recordable_event_id AS recordableEventId,
          date_key AS dateKey,
          occurred_at AS occurredAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM recorded_events
        WHERE id = ${recordedEventId}
      `,
  });
  const findRecordedEventsByRangeRows = SqlSchema.findAll({
    Request: Schema.Struct({
      endDateKey: Domain.DateKey,
      startDateKey: Domain.DateKey,
    }),
    Result: RecordedEventRow,
    execute: ({ endDateKey, startDateKey }) =>
      sql`
        SELECT
          id,
          recordable_event_id AS recordableEventId,
          date_key AS dateKey,
          occurred_at AS occurredAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM recorded_events
        WHERE date_key >= ${startDateKey} AND date_key <= ${endDateKey}
        ORDER BY
          date_key DESC,
          occurred_at IS NULL,
          occurred_at DESC,
          created_at DESC,
          id DESC
      `,
  });
  const listRecentRecordedEventRows = SqlSchema.findAll({
    Request: RecentRecordedEventsRequest,
    Result: RecordedEventRow,
    execute: ({ limit }) =>
      sql`
        SELECT
          id,
          recordable_event_id AS recordableEventId,
          date_key AS dateKey,
          occurred_at AS occurredAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM recorded_events
        ORDER BY
          date_key DESC,
          occurred_at IS NULL,
          occurred_at DESC,
          created_at DESC,
          id DESC
        LIMIT ${limit}
      `,
  });

  const findMissingRecordableEventReferenceRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: MissingRecordableEventReferenceRow,
    execute: () =>
      sql`
        SELECT
          recorded_events.id AS recordedEventId,
          recorded_events.recordable_event_id AS recordableEventId
        FROM recorded_events
        LEFT JOIN recordable_events
          ON recordable_events.id = recorded_events.recordable_event_id
        WHERE recordable_events.id IS NULL
        ORDER BY recorded_events.id
        LIMIT 1
      `,
  });

  const decodeRecordableEventRow = (row: typeof RecordableEventRow.Type) =>
    Schema.decodeEffect(Domain.RecordableEvent)({
      createdAt: row.createdAt,
      emoji: row.emoji,
      id: row.id,
      name: row.name,
      position: row.position,
      updatedAt: row.updatedAt,
      ...(row.archivedAt === null ? {} : { archivedAt: row.archivedAt }),
    });
  const decodeRecordedEventRow = (row: typeof RecordedEventRow.Type) =>
    Schema.decodeEffect(Domain.RecordedEvent)({
      createdAt: row.createdAt,
      dateKey: row.dateKey,
      id: row.id,
      recordableEventId: row.recordableEventId,
      updatedAt: row.updatedAt,
      ...(row.occurredAt === null ? {} : { occurredAt: row.occurredAt }),
    });
  const decodeRecordableEventRows = (
    rows: readonly (typeof RecordableEventRow.Type)[]
  ) => Effect.forEach(rows, decodeRecordableEventRow);
  const decodeRecordedEventRows = (
    rows: readonly (typeof RecordedEventRow.Type)[]
  ) => Effect.forEach(rows, decodeRecordedEventRow);
  const listRecordableEvents = listRecordableEventRows({}).pipe(
    Effect.flatMap(decodeRecordableEventRows)
  );
  const listRecordedEvents = listRecordedEventRows({}).pipe(
    Effect.flatMap(decodeRecordedEventRows)
  );
  const recordableEventRowValues = (
    recordableEvent: typeof Domain.RecordableEvent.Encoded
  ) => ({
    archived_at: recordableEvent.archivedAt ?? null,
    created_at: recordableEvent.createdAt,
    emoji: recordableEvent.emoji,
    id: recordableEvent.id,
    name: recordableEvent.name,
    name_key: Domain.recordableEventNameKey({ name: recordableEvent.name }),
    position: recordableEvent.position,
    updated_at: recordableEvent.updatedAt,
  });
  const recordedEventRowValues = (
    recordedEvent: typeof Domain.RecordedEvent.Encoded
  ) => ({
    created_at: recordedEvent.createdAt,
    date_key: recordedEvent.dateKey,
    id: recordedEvent.id,
    occurred_at: recordedEvent.occurredAt ?? null,
    recordable_event_id: recordedEvent.recordableEventId,
    updated_at: recordedEvent.updatedAt,
  });
  const insertRecordableEvent = (recordableEvent: Domain.RecordableEvent) =>
    Schema.encodeEffect(Domain.RecordableEvent)(recordableEvent).pipe(
      Effect.flatMap((encodedRecordableEvent) => {
        const row = recordableEventRowValues(encodedRecordableEvent);

        return sql`INSERT INTO recordable_events ${sql.insert(row)}`;
      })
    );
  const insertRecordableEventUnlessNameConflict = (
    recordableEvent: Domain.RecordableEvent
  ) =>
    Schema.encodeEffect(Domain.RecordableEvent)(recordableEvent).pipe(
      Effect.flatMap((encodedRecordableEvent) => {
        const row = recordableEventRowValues(encodedRecordableEvent);

        return sql`
          INSERT INTO recordable_events ${sql.insert(row)}
          ON CONFLICT(name_key) DO NOTHING
          RETURNING id
        `;
      })
    );
  const upsertRecordableEvent = (recordableEvent: Domain.RecordableEvent) =>
    Schema.encodeEffect(Domain.RecordableEvent)(recordableEvent).pipe(
      Effect.flatMap((encodedRecordableEvent) => {
        const row = recordableEventRowValues(encodedRecordableEvent);

        return sql`
          INSERT INTO recordable_events ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET
            ${sql.update(row, ["id"])}
          WHERE NOT EXISTS (
            SELECT 1
            FROM recordable_events AS conflicting_recordable_event
            WHERE
              conflicting_recordable_event.name_key = excluded.name_key AND
              conflicting_recordable_event.id <> excluded.id
          )
          ON CONFLICT(name_key) DO NOTHING
          RETURNING id
        `;
      })
    );
  const insertRecordedEvent = (recordedEvent: Domain.RecordedEvent) =>
    Schema.encodeEffect(Domain.RecordedEvent)(recordedEvent).pipe(
      Effect.flatMap((encodedRecordedEvent) => {
        const row = recordedEventRowValues(encodedRecordedEvent);

        return sql`INSERT INTO recorded_events ${sql.insert(row)}`;
      })
    );
  const insertRecordedEvents = (
    recordedEvents: readonly Domain.RecordedEvent[]
  ) =>
    Array.isReadonlyArrayNonEmpty(recordedEvents)
      ? Effect.forEach(recordedEvents, (recordedEvent) =>
          Schema.encodeEffect(Domain.RecordedEvent)(recordedEvent)
        ).pipe(
          Effect.flatMap(
            (encodedRecordedEvents) =>
              sql`INSERT INTO recorded_events ${sql.insert(
                encodedRecordedEvents.map(recordedEventRowValues)
              )}`
          )
        )
      : Effect.void;

  return Store.EventTrackingStore.of({
    deleteRecordedEvent: (recordedEventId) =>
      _mapStoreError(
        sql`DELETE FROM recorded_events WHERE id = ${recordedEventId}`
      ),

    findRecordableEventById: (recordableEventId) =>
      _mapStoreError(
        findRecordableEventByIdRows(recordableEventId).pipe(
          Effect.flatMap(decodeRecordableEventRows)
        )
      ),

    findRecordableEventsByName: (name) =>
      _mapStoreError(
        findRecordableEventsByNameRows(name).pipe(
          Effect.flatMap(decodeRecordableEventRows)
        )
      ),

    findRecordedEventById: (recordedEventId) =>
      _mapStoreError(
        findRecordedEventByIdRows(recordedEventId).pipe(
          Effect.flatMap(decodeRecordedEventRows)
        )
      ),

    findRecordedEventsByRange: (input) =>
      _mapStoreError(
        findRecordedEventsByRangeRows(input).pipe(
          Effect.flatMap(decodeRecordedEventRows)
        )
      ),

    insertRecordableEvent: (recordableEvent) =>
      _mapStoreError(
        insertRecordableEventUnlessNameConflict(recordableEvent)
      ).pipe(
        Effect.flatMap((insertedRows) =>
          Array.isReadonlyArrayNonEmpty(insertedRows)
            ? Effect.void
            : Effect.fail(
                new Store.RecordableEventNameConflict({
                  cause:
                    "A recordable event already uses this normalized name.",
                })
              )
        )
      ),

    insertRecordedEvent: (recordedEvent) =>
      _mapStoreError(insertRecordedEvent(recordedEvent)),

    insertRecordedEvents: (recordedEvents) =>
      _mapStoreError(insertRecordedEvents(recordedEvents)),

    listRecentRecordedEvents: (limit) =>
      _mapStoreError(
        listRecentRecordedEventRows({ limit }).pipe(
          Effect.flatMap(decodeRecordedEventRows)
        )
      ),

    listRecordableEvents: _mapStoreError(listRecordableEvents),

    listRecordedEvents: _mapStoreError(listRecordedEvents),

    readStores: _mapStoreError(
      sql.withTransaction(
        Effect.gen(function* () {
          return {
            recordableEvents: yield* listRecordableEvents,
            recordedEvents: yield* listRecordedEvents,
          } satisfies Store.EventTrackingStores;
        })
      )
    ),

    replaceStores: (stores) =>
      _mapStoreError(
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM recorded_events`;
            yield* sql`DELETE FROM recordable_events`;
            yield* Effect.forEach(
              stores.recordableEvents,
              insertRecordableEvent,
              { discard: true }
            );
            yield* Effect.forEach(stores.recordedEvents, insertRecordedEvent, {
              discard: true,
            });
            const missingReferences =
              yield* findMissingRecordableEventReferenceRows({});
            const missingReference = missingReferences[0];

            if (missingReference !== undefined) {
              return yield* new _MissingRecordableEventReference(
                missingReference
              );
            }
          })
        )
      ),

    upsertRecordableEvent: (recordableEvent) =>
      _mapStoreError(upsertRecordableEvent(recordableEvent)).pipe(
        Effect.flatMap((upsertedRows) =>
          Array.isReadonlyArrayNonEmpty(upsertedRows)
            ? Effect.void
            : Effect.fail(
                new Store.RecordableEventNameConflict({
                  cause:
                    "A recordable event already uses this normalized name.",
                })
              )
        )
      ),
  });
});

export const SqliteEventTrackingStoreLayer = Layer.effect(
  Store.EventTrackingStore,
  makeSqliteEventTrackingStore.pipe(
    Effect.mapError(
      (cause) =>
        new Store.EventTrackingStoreError({
          cause,
        })
    )
  )
);
