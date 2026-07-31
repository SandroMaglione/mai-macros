import {
  Domain,
  RecordableEvents,
  RecordedEvents,
  Store,
  TimeZone,
} from "@mai/event-tracking";
import {
  AppDataStore,
  Backup,
  Domain as NutritionDomain,
  LocalData,
  Store as NutritionStore,
} from "@mai/nutrition";
import { Crypto, DateTime, Effect, Exit, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { assert, describe, it } from "vitest";

import {
  TestSqliteAppDataStoreLayer,
  TestSqliteDataLayer,
  TestSqliteEventTrackingStoreLayer,
} from "./sqlite-test-layers.ts";

const waterEventId = "11111111-1111-4111-8111-111111111111";
const coffeeEventId = "22222222-2222-4222-8222-222222222222";
const firstRecordedEventId = "33333333-3333-4333-8333-333333333333";
const secondRecordedEventId = "44444444-4444-4444-8444-444444444444";
const thirdRecordedEventId = "55555555-5555-4555-8555-555555555555";

const ForeignKeySettingRow = Schema.Struct({ enabled: Schema.Number });

const backupTestLayer = Backup.Backups.layer.pipe(
  Layer.provideMerge(TestSqliteAppDataStoreLayer)
);

const _recordableEvent = ({
  emoji,
  id,
  name,
  position,
}: {
  readonly emoji: string;
  readonly id: string;
  readonly name: string;
  readonly position: number;
}) =>
  Schema.decodeEffect(Domain.RecordableEvent)({
    createdAt: 100,
    emoji,
    id,
    name,
    position,
    updatedAt: 100,
  });

const _recordedEvent = ({
  createdAt,
  dateKey,
  id,
  occurredAt,
  recordableEventId,
}: {
  readonly createdAt: number;
  readonly dateKey: string;
  readonly id: string;
  readonly occurredAt: number | undefined;
  readonly recordableEventId: string;
}) =>
  Schema.decodeEffect(Domain.RecordedEvent)({
    createdAt,
    dateKey,
    id,
    recordableEventId,
    updatedAt: createdAt,
    ...(occurredAt === undefined ? {} : { occurredAt }),
  });

describe("SqliteEventTrackingStore", () => {
  it("records now through the services and round-trips the occurrence", async () => {
    let nextByte = 1;
    const cryptoLayer = Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        digest: (algorithm, data) =>
          Effect.succeed(algorithm).pipe(Effect.as(data)),
        randomBytes: (size) => {
          const bytes = new Uint8Array(size);

          bytes.fill(nextByte);
          nextByte += 1;

          return bytes;
        },
      })
    );
    const serviceLayer = Layer.mergeAll(
      RecordableEvents.RecordableEvents.layer,
      RecordedEvents.RecordedEvents.layer
    ).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          TestSqliteEventTrackingStoreLayer,
          cryptoLayer,
          TimeZone.EventTrackingTimeZone.layerLocal
        )
      )
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const recordableEvents = yield* RecordableEvents.RecordableEvents;
        const recordedEvents = yield* RecordedEvents.RecordedEvents;
        const store = yield* Store.EventTrackingStore;
        const created = yield* recordableEvents.create({
          input: { emoji: "💧", name: "Hydrate" },
        });
        const recorded = yield* recordedEvents.recordNow({
          input: { recordableEventId: created.recordableEvent.id },
        });

        return {
          recorded,
          roundTripped: yield* store.findRecordedEventById(
            recorded.recordedEvent.id
          ),
        };
      }).pipe(Effect.provide(serviceLayer))
    );
    const roundTripped = result.roundTripped[0];

    assert.isDefined(roundTripped);
    assert.equal(
      roundTripped?.recordableEventId,
      result.recorded.recordableEvent.id
    );
    assert.equal(roundTripped?.dateKey, result.recorded.recordedEvent.dateKey);
    assert.equal(
      roundTripped?.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(roundTripped.occurredAt),
      result.recorded.recordedEvent.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(result.recorded.recordedEvent.occurredAt)
    );
  });

  it("rolls back every occurrence when a batch insert fails", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 0,
        });
        const valid = yield* _recordedEvent({
          createdAt: 300,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: undefined,
          recordableEventId: waterEventId,
        });
        const missingParent = yield* _recordedEvent({
          createdAt: 400,
          dateKey: "2026-07-31",
          id: secondRecordedEventId,
          occurredAt: undefined,
          recordableEventId: coffeeEventId,
        });

        yield* store.insertRecordableEvent(water);
        const batchExit = yield* Effect.exit(
          store.insertRecordedEvents([valid, missingParent])
        );

        return { batchExit, stores: yield* store.readStores };
      }).pipe(Effect.provide(TestSqliteEventTrackingStoreLayer))
    );

    assert.equal(Exit.isFailure(result.batchExit), true);
    assert.equal(result.stores.recordedEvents.length, 0);
  });

  it("round-trips definitions and exact or day-precision occurrences", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 1,
        });
        const coffee = yield* _recordableEvent({
          emoji: "☕",
          id: coffeeEventId,
          name: "Coffee",
          position: 0,
        });
        const exact = yield* _recordedEvent({
          createdAt: 300,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 250,
          recordableEventId: waterEventId,
        });
        const dayPrecision = yield* _recordedEvent({
          createdAt: 400,
          dateKey: "2026-07-30",
          id: secondRecordedEventId,
          occurredAt: undefined,
          recordableEventId: coffeeEventId,
        });
        const sameDayPrecision = yield* _recordedEvent({
          createdAt: 500,
          dateKey: "2026-07-31",
          id: thirdRecordedEventId,
          occurredAt: undefined,
          recordableEventId: waterEventId,
        });

        yield* store.insertRecordableEvent(water);
        yield* store.insertRecordableEvent(coffee);
        yield* store.insertRecordedEvent(dayPrecision);
        yield* store.insertRecordedEvent(sameDayPrecision);
        yield* store.insertRecordedEvent(exact);

        return {
          byCaseInsensitiveName: yield* store.findRecordableEventsByName(
            yield* Schema.decodeEffect(Domain.RecordableEventName)("water")
          ),
          range: yield* store.findRecordedEventsByRange({
            endDateKey: yield* Schema.decodeEffect(Domain.DateKey)(
              "2026-07-31"
            ),
            startDateKey: yield* Schema.decodeEffect(Domain.DateKey)(
              "2026-07-30"
            ),
          }),
          recent: yield* store.listRecentRecordedEvents(2),
          stores: yield* store.readStores,
        };
      }).pipe(Effect.provide(TestSqliteEventTrackingStoreLayer))
    );

    assert.deepStrictEqual(
      result.stores.recordableEvents.map(({ name }) => name),
      ["Coffee", "Water"]
    );
    assert.equal(result.byCaseInsensitiveName[0]?.id, waterEventId);
    assert.deepStrictEqual(
      result.range.map(({ id }) => id),
      [firstRecordedEventId, thirdRecordedEventId, secondRecordedEventId]
    );
    assert.deepStrictEqual(
      result.recent.map(({ id }) => id),
      [firstRecordedEventId, thirdRecordedEventId]
    );
    assert.equal(
      result.stores.recordedEvents[0]?.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(result.stores.recordedEvents[0].occurredAt),
      250
    );
    assert.isUndefined(result.stores.recordedEvents[1]?.occurredAt);
    assert.isUndefined(result.stores.recordedEvents[2]?.occurredAt);
  });

  it("round-trips archived updates and deletes only the requested occurrence", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 0,
        });
        const first = yield* _recordedEvent({
          createdAt: 300,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 250,
          recordableEventId: waterEventId,
        });
        const second = yield* _recordedEvent({
          createdAt: 400,
          dateKey: "2026-07-30",
          id: secondRecordedEventId,
          occurredAt: undefined,
          recordableEventId: waterEventId,
        });

        yield* store.insertRecordableEvent(water);
        yield* store.insertRecordedEvent(first);
        yield* store.insertRecordedEvent(second);

        const encodedWater = yield* Schema.encodeEffect(Domain.RecordableEvent)(
          water
        );
        const archivedWater = yield* Schema.decodeEffect(
          Domain.RecordableEvent
        )({
          ...encodedWater,
          archivedAt: 200,
          name: "Drink water",
          updatedAt: 200,
        });

        yield* store.upsertRecordableEvent(archivedWater);
        yield* store.deleteRecordedEvent(first.id);

        return yield* store.readStores;
      }).pipe(Effect.provide(TestSqliteEventTrackingStoreLayer))
    );

    assert.equal(result.recordableEvents[0]?.name, "Drink water");
    assert.equal(
      result.recordableEvents[0]?.archivedAt === undefined
        ? null
        : DateTime.toEpochMillis(result.recordableEvents[0].archivedAt),
      200
    );
    assert.deepStrictEqual(
      result.recordedEvents.map(({ id }) => id),
      [secondRecordedEventId]
    );
  });

  it("rejects duplicate ids and names as typed store errors", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Été",
          position: 0,
        });
        const duplicateName = yield* _recordableEvent({
          emoji: "🚰",
          id: coffeeEventId,
          name: "E\u0301TE\u0301",
          position: 1,
        });
        const duplicateId = yield* _recordableEvent({
          emoji: "☕",
          id: waterEventId,
          name: "Coffee",
          position: 1,
        });
        const coffee = yield* _recordableEvent({
          emoji: "☕",
          id: coffeeEventId,
          name: "Coffee",
          position: 1,
        });

        yield* store.insertRecordableEvent(water);
        const duplicateIdFailure = yield* store
          .insertRecordableEvent(duplicateId)
          .pipe(Effect.flip);
        const duplicateNameFailure = yield* store
          .insertRecordableEvent(duplicateName)
          .pipe(Effect.flip);
        yield* store.insertRecordableEvent(coffee);
        const encodedCoffee = yield* Schema.encodeEffect(
          Domain.RecordableEvent
        )(coffee);
        const conflictingCoffee = yield* Schema.decodeEffect(
          Domain.RecordableEvent
        )({
          ...encodedCoffee,
          name: "E\u0301TE\u0301",
          updatedAt: 200,
        });
        const updateNameFailure = yield* store
          .upsertRecordableEvent(conflictingCoffee)
          .pipe(Effect.flip);

        return {
          duplicateIdFailure,
          duplicateNameFailure,
          stores: yield* store.readStores,
          updateNameFailure,
        };
      }).pipe(Effect.provide(TestSqliteEventTrackingStoreLayer))
    );

    assert.instanceOf(result.duplicateIdFailure, Store.EventTrackingStoreError);
    assert.instanceOf(
      result.duplicateNameFailure,
      Store.RecordableEventNameConflict
    );
    assert.instanceOf(
      result.updateNameFailure,
      Store.RecordableEventNameConflict
    );
    assert.deepStrictEqual(
      result.stores.recordableEvents.map(({ name }) => name),
      ["Été", "Coffee"]
    );
  });

  it("round-trips Unicode event names through SQLite backup import", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const appDataStore = yield* AppDataStore.AppDataStore;
        const backups = yield* Backup.Backups;
        const store = yield* Store.EventTrackingStore;
        const event = yield* _recordableEvent({
          emoji: "☀️",
          id: waterEventId,
          name: "Été",
          position: 0,
        });
        const occurrence = yield* _recordedEvent({
          createdAt: 200,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 190,
          recordableEventId: event.id,
        });

        yield* store.insertRecordableEvent(event);
        yield* store.insertRecordedEvent(occurrence);
        const exported = yield* backups.exportToJson();
        yield* appDataStore.replaceStores({
          activeMealPlanSelections: [],
          bodyWeightEntries: [],
          dailyLogs: [],
          foods: [],
          mealEntries: [],
          plans: [],
          recordableEvents: [],
          recordedEvents: [],
        });
        yield* backups.importFromJson({ input: { json: exported.json } });

        return yield* store.readStores;
      }).pipe(Effect.provide(backupTestLayer))
    );

    assert.deepStrictEqual(
      result.recordableEvents.map(({ name }) => name),
      ["Été"]
    );
    assert.deepStrictEqual(
      result.recordedEvents.map(({ id }) => id),
      [firstRecordedEventId]
    );
  });

  it("rolls back an end-to-end backup import when SQLite rejects a write", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const backups = yield* Backup.Backups;
        const sql = yield* SqlClient.SqlClient;
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 0,
        });
        const occurrence = yield* _recordedEvent({
          createdAt: 200,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 190,
          recordableEventId: water.id,
        });

        yield* store.insertRecordableEvent(water);
        yield* store.insertRecordedEvent(occurrence);
        const exported = yield* backups.exportToJson();
        yield* sql`
          CREATE TRIGGER fail_recordable_event_import
          BEFORE INSERT ON recordable_events
          BEGIN
            SELECT RAISE(ABORT, 'simulated import failure');
          END
        `;
        const failure = yield* backups
          .importFromJson({ input: { json: exported.json } })
          .pipe(Effect.flip);

        return {
          failure,
          stores: yield* store.readStores,
        };
      }).pipe(Effect.provide(backupTestLayer))
    );

    assert.instanceOf(result.failure, AppDataStore.AppDataStoreError);
    assert.deepStrictEqual(
      result.stores.recordableEvents.map(({ id }) => id),
      [waterEventId]
    );
    assert.deepStrictEqual(
      result.stores.recordedEvents.map(({ id }) => id),
      [firstRecordedEventId]
    );
  });

  it("maps invalid persisted domain rows to the event store error", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const store = yield* Store.EventTrackingStore;

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
            ${waterEventId},
            'Water',
            'water',
            'not-an-emoji',
            0,
            NULL,
            100,
            100
          )
        `;

        return yield* store.listRecordableEvents;
      }).pipe(Effect.provide(TestSqliteEventTrackingStoreLayer), Effect.flip)
    );

    assert.instanceOf(failure, Store.EventTrackingStoreError);
  });

  it("rolls back a replace when an occurrence references a missing definition", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 0,
        });
        const exact = yield* _recordedEvent({
          createdAt: 300,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 250,
          recordableEventId: waterEventId,
        });
        const missingDefinitionOccurrence = yield* _recordedEvent({
          createdAt: 400,
          dateKey: "2026-07-30",
          id: secondRecordedEventId,
          occurredAt: undefined,
          recordableEventId: coffeeEventId,
        });

        yield* store.replaceStores({
          recordableEvents: [water],
          recordedEvents: [exact],
        });
        const failure = yield* store
          .replaceStores({
            recordableEvents: [],
            recordedEvents: [missingDefinitionOccurrence],
          })
          .pipe(Effect.flip);

        return {
          failure,
          stores: yield* store.readStores,
        };
      }).pipe(Effect.provide(TestSqliteEventTrackingStoreLayer))
    );

    assert.instanceOf(result.failure, Store.EventTrackingStoreError);
    assert.deepStrictEqual(
      result.stores.recordableEvents.map(({ id }) => id),
      [waterEventId]
    );
    assert.deepStrictEqual(
      result.stores.recordedEvents.map(({ id }) => id),
      [firstRecordedEventId]
    );
  });

  it("keeps nutrition and event data atomic during app-data replacement", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const appDataStore = yield* AppDataStore.AppDataStore;
        const nutritionStore = yield* NutritionStore.NutritionStore;
        const eventTrackingStore = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 0,
        });
        const exact = yield* _recordedEvent({
          createdAt: 300,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 250,
          recordableEventId: waterEventId,
        });

        yield* eventTrackingStore.insertRecordableEvent(water);
        yield* eventTrackingStore.insertRecordedEvent(exact);

        const initialStores = yield* appDataStore.readStores;
        const missingDefinitionOccurrence = yield* _recordedEvent({
          createdAt: 400,
          dateKey: "2026-07-30",
          id: secondRecordedEventId,
          occurredAt: undefined,
          recordableEventId: coffeeEventId,
        });

        const failure = yield* appDataStore
          .replaceStores({
            activeMealPlanSelections: [],
            bodyWeightEntries: [],
            dailyLogs: [],
            foods: [],
            mealEntries: [],
            plans: [],
            recordableEvents: [],
            recordedEvents: [missingDefinitionOccurrence],
          })
          .pipe(Effect.flip);

        return {
          after: yield* appDataStore.readStores,
          failure,
          nutritionFoods: yield* nutritionStore.listFoods,
          initial: initialStores,
        };
      }).pipe(Effect.provide(TestSqliteAppDataStoreLayer))
    );

    assert.instanceOf(result.failure, AppDataStore.AppDataStoreError);
    assert.equal(result.after.foods.length, result.initial.foods.length);
    assert.equal(result.nutritionFoods.length, result.initial.foods.length);
    assert.deepStrictEqual(
      result.after.recordableEvents.map(({ id }) => id),
      [waterEventId]
    );
    assert.deepStrictEqual(
      result.after.recordedEvents.map(({ id }) => id),
      [firstRecordedEventId]
    );
  });

  it("maps deferred nutrition references before the app-data commit", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const appDataStore = yield* AppDataStore.AppDataStore;
        const initialStores = yield* appDataStore.readStores;
        const dailyLog = yield* Schema.decodeEffect(NutritionDomain.DailyLog)({
          createdAt: 100,
          dateKey: "2026-07-31",
          planId: "66666666-6666-4666-8666-666666666666",
          updatedAt: 100,
        });
        const failure = yield* appDataStore
          .replaceStores({
            activeMealPlanSelections: [],
            bodyWeightEntries: [],
            dailyLogs: [dailyLog],
            foods: [],
            mealEntries: [],
            plans: [],
            recordableEvents: [],
            recordedEvents: [],
          })
          .pipe(Effect.flip);

        return {
          after: yield* appDataStore.readStores,
          failure,
          initialStores,
        };
      }).pipe(Effect.provide(TestSqliteAppDataStoreLayer))
    );

    assert.instanceOf(result.failure, AppDataStore.AppDataStoreError);
    assert.equal(result.after.foods.length, result.initialStores.foods.length);
    assert.deepStrictEqual(
      result.after.dailyLogs,
      result.initialStores.dailyLogs
    );
  });

  it("reset recreates empty event tables that remain writable", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const localData = yield* LocalData.LocalData;
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 0,
        });
        const exact = yield* _recordedEvent({
          createdAt: 300,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 250,
          recordableEventId: waterEventId,
        });

        yield* store.insertRecordableEvent(water);
        yield* store.insertRecordedEvent(exact);
        yield* localData.reset;

        const afterReset = yield* store.readStores;

        yield* store.insertRecordableEvent(water);

        return {
          afterReinsert: yield* store.readStores,
          afterReset,
        };
      }).pipe(Effect.provide(TestSqliteDataLayer))
    );

    assert.deepStrictEqual(result.afterReset, {
      recordableEvents: [],
      recordedEvents: [],
    });
    assert.deepStrictEqual(
      result.afterReinsert.recordableEvents.map(({ id }) => id),
      [waterEventId]
    );
    assert.deepStrictEqual(result.afterReinsert.recordedEvents, []);
  });

  it("rolls back a failed reset and restores foreign-key enforcement", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const localData = yield* LocalData.LocalData;
        const sql = yield* SqlClient.SqlClient;
        const store = yield* Store.EventTrackingStore;
        const water = yield* _recordableEvent({
          emoji: "💧",
          id: waterEventId,
          name: "Water",
          position: 0,
        });
        const occurrence = yield* _recordedEvent({
          createdAt: 300,
          dateKey: "2026-07-31",
          id: firstRecordedEventId,
          occurredAt: 250,
          recordableEventId: waterEventId,
        });

        yield* store.insertRecordableEvent(water);
        yield* store.insertRecordedEvent(occurrence);
        yield* sql`
          CREATE TABLE reset_collision (
            id TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          )
        `;
        yield* sql`DROP INDEX recorded_events_by_date`;
        yield* sql`
          CREATE INDEX recorded_events_by_date
          ON reset_collision(value)
        `;

        const failure = yield* localData.reset.pipe(Effect.flip);
        const readForeignKeySetting = SqlSchema.findOne({
          Request: Schema.Struct({}),
          Result: ForeignKeySettingRow,
          execute: () =>
            sql`SELECT foreign_keys AS enabled FROM pragma_foreign_keys`,
        });

        return {
          failure,
          foreignKeysEnabled: (yield* readForeignKeySetting({})).enabled,
          stores: yield* store.readStores,
        };
      }).pipe(Effect.provide(TestSqliteDataLayer))
    );

    assert.instanceOf(result.failure, LocalData.LocalDataResetError);
    assert.equal(result.foreignKeysEnabled, 1);
    assert.deepStrictEqual(
      result.stores.recordableEvents.map(({ id }) => id),
      [waterEventId]
    );
    assert.deepStrictEqual(
      result.stores.recordedEvents.map(({ id }) => id),
      [firstRecordedEventId]
    );
  });
});
