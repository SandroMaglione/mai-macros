import * as EventDomain from "@mai/event-tracking/domain";
import { Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { AppDataStore, Backup } from "../src/index.ts";
import * as Domain from "../src/domain.ts";

const recordableEventId = "11111111-1111-4111-8111-111111111111";
const secondRecordableEventId = "22222222-2222-4222-8222-222222222222";
const recordedEventId = "33333333-3333-4333-8333-333333333333";
const secondRecordedEventId = "44444444-4444-4444-8444-444444444444";
const planId = "55555555-5555-4555-8555-555555555555";
const mealId = "66666666-6666-4666-8666-666666666666";
const firstFoodId = "77777777-7777-4777-8777-777777777777";
const secondFoodId = "88888888-8888-4888-8888-888888888888";
const portionId = "99999999-9999-4999-8999-999999999999";
const priceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const emptyStores: AppDataStore.AppDataStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
  recordableEvents: [],
  recordedEvents: [],
};

const emptyEncodedStores: Backup.MaiBackupEncoded["stores"] = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
  recordableEvents: [],
  recordedEvents: [],
};

const _eventFixtures = {
  recordableEvent({
    id = recordableEventId,
    name = "Water",
    position = 0,
  }: {
    readonly id?: string | undefined;
    readonly name?: string | undefined;
    readonly position?: number | undefined;
  } = {}) {
    return {
      createdAt: 100,
      emoji: "💧",
      id,
      name,
      position,
      updatedAt: 100,
    };
  },

  recordedEvent({
    id = recordedEventId,
    referencedRecordableEventId = recordableEventId,
  }: {
    readonly id?: string | undefined;
    readonly referencedRecordableEventId?: string | undefined;
  } = {}) {
    return {
      createdAt: 200,
      dateKey: "2026-07-31",
      id,
      occurredAt: 190,
      recordableEventId: referencedRecordableEventId,
      updatedAt: 200,
    };
  },
};

const _encodedBackup = ({
  recordableEventCount,
  recordableEvents = [],
  recordedEventCount,
  recordedEvents = [],
  storeOverrides = {},
}: {
  readonly recordableEventCount?: number | undefined;
  readonly recordableEvents?: readonly ReturnType<
    typeof _eventFixtures.recordableEvent
  >[];
  readonly recordedEventCount?: number | undefined;
  readonly recordedEvents?: readonly ReturnType<
    typeof _eventFixtures.recordedEvent
  >[];
  readonly storeOverrides?: Partial<Backup.MaiBackupEncoded["stores"]>;
} = {}): Backup.MaiBackupEncoded => {
  const stores = {
    ...emptyEncodedStores,
    ...storeOverrides,
    recordableEvents,
    recordedEvents,
  };

  return {
    format: "mai.backup",
    formatVersion: 1,
    integrity: {
      counts: {
        activeMealPlanSelections: stores.activeMealPlanSelections.length,
        bodyWeightEntries: stores.bodyWeightEntries.length,
        dailyLogs: stores.dailyLogs.length,
        foods: stores.foods.length,
        mealEntries: stores.mealEntries.length,
        plans: stores.plans.length,
        recordableEvents: recordableEventCount ?? recordableEvents.length,
        recordedEvents: recordedEventCount ?? recordedEvents.length,
      },
    },
    source: {
      databaseName: "mai",
      databaseVersion: 10,
      exportedAt: 300,
    },
    stores,
  };
};

const encodedPlan = {
  carbsTargetGrams: 0,
  createdAt: 100,
  fatTargetGrams: 0,
  id: planId,
  meals: [{ createdAt: 100, id: mealId, name: "Meal", position: 0 }],
  name: "Plan",
  proteinTargetGrams: 0,
};

const _encodedFood = ({
  id,
  name,
  portions = [],
  prices = [],
}: {
  readonly id: string;
  readonly name: string;
  readonly portions?: readonly {
    readonly id: string;
    readonly name: string;
    readonly position: number;
    readonly size: { readonly amount: number; readonly unit: "g" };
  }[];
  readonly prices?: readonly {
    readonly createdAt: number;
    readonly currency: "EUR";
    readonly id: string;
    readonly isCurrent: boolean;
    readonly priceMinor: number;
    readonly referenceQuantity: {
      readonly amount: number;
      readonly unit: "g";
    };
    readonly updatedAt: number;
  }[];
}) => ({
  carbsGrams: 0,
  createdAt: 100,
  energyKcal: 0,
  fatGrams: 0,
  id,
  name,
  nutritionReference: { amount: 100, unit: "g" as const },
  origin: "user" as const,
  portions,
  prices,
  proteinGrams: 0,
  updatedAt: 100,
});

function _makeTestContext() {
  let currentStores = emptyStores;
  let replaceStoresCalls = 0;
  const appDataStoreLayer = Layer.succeed(AppDataStore.AppDataStore, {
    readStores: Effect.sync(() => currentStores),
    replaceStores: (stores) =>
      Effect.sync(() => {
        replaceStoresCalls += 1;
        currentStores = stores;
      }),
  });
  const layer = Backup.Backups.layer.pipe(
    Layer.provideMerge(appDataStoreLayer)
  );

  return {
    layer,
    readReplaceStoresCalls: () => replaceStoresCalls,
    readStores: () => currentStores,
  };
}

describe("backup database version 9", () => {
  it("round-trips event definitions and occurrences with required counts", async () => {
    const testContext = _makeTestContext();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* AppDataStore.AppDataStore;
        const backups = yield* Backup.Backups;
        const definition = yield* Schema.decodeEffect(
          EventDomain.RecordableEvent
        )(_eventFixtures.recordableEvent());
        const occurrence = yield* Schema.decodeEffect(
          EventDomain.RecordedEvent
        )(_eventFixtures.recordedEvent());

        yield* store.replaceStores({
          ...emptyStores,
          recordableEvents: [definition],
          recordedEvents: [occurrence],
        });
        const exported = yield* backups.exportToJson();
        yield* store.replaceStores(emptyStores);
        const imported = yield* backups.importFromJson({
          input: { json: exported.json },
        });

        return { exported, imported, stores: yield* store.readStores };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.exported.backup.source.databaseVersion, 10);
    assert.equal(result.exported.backup.integrity.counts.recordableEvents, 1);
    assert.equal(result.exported.backup.integrity.counts.recordedEvents, 1);
    assert.equal(result.imported.backup.source.databaseVersion, 10);
    assert.equal(result.stores.recordableEvents[0]?.name, "Water");
    assert.equal(result.stores.recordableEvents[0]?.emoji, "💧");
    assert.equal(
      result.stores.recordedEvents[0]?.recordableEventId,
      recordableEventId
    );
    assert.equal(result.stores.recordedEvents[0]?.dateKey, "2026-07-31");
  });

  it("round-trips excluded day modes", async () => {
    const testContext = _makeTestContext();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* AppDataStore.AppDataStore;
        const backups = yield* Backup.Backups;
        const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
          createdAt: 100,
          dateKey: "2026-07-31",
          mode: "fasting",
          planId,
          updatedAt: 100,
        });
        const notRecordedDailyLog = yield* Schema.decodeEffect(Domain.DailyLog)(
          {
            createdAt: 200,
            dateKey: "2026-08-01",
            mode: "not-recorded",
            planId,
            updatedAt: 200,
          }
        );
        const plan = yield* Schema.decodeEffect(Domain.Plan)(encodedPlan);

        yield* store.replaceStores({
          ...emptyStores,
          dailyLogs: [dailyLog, notRecordedDailyLog],
          plans: [plan],
        });
        const exported = yield* backups.exportToJson();
        yield* store.replaceStores(emptyStores);
        const imported = yield* backups.importFromJson({
          input: { json: exported.json },
        });

        return { imported, stores: yield* store.readStores };
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.imported.backup.source.databaseVersion, 10);
    assert.equal(result.stores.dailyLogs[0]?.mode, "fasting");
    assert.equal(result.stores.dailyLogs[1]?.mode, "not-recorded");
  });

  it("migrates version 8 daily logs to eating mode", async () => {
    const testContext = _makeTestContext();
    const rawBackup = _encodedBackup({
      storeOverrides: {
        dailyLogs: [
          {
            createdAt: 100,
            dateKey: "2026-07-31",
            planId,
            updatedAt: 100,
          },
        ],
        plans: [encodedPlan],
      },
    });
    const legacyJson = await Effect.runPromise(
      Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
        ...rawBackup,
        source: { ...rawBackup.source, databaseVersion: 8 },
      })
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const backups = yield* Backup.Backups;

        return yield* backups.importFromJson({
          input: { json: legacyJson },
        });
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.backup.source.databaseVersion, 10);
    assert.equal(result.backup.stores.dailyLogs[0]?.mode, "eating");
    assert.equal(testContext.readStores().dailyLogs[0]?.mode, "eating");
  });

  it("migrates a valid version 7 backup with empty event stores", async () => {
    const testContext = _makeTestContext();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const backups = yield* Backup.Backups;
        const current = yield* backups.exportToJson();
        const encoded = yield* Schema.encodeEffect(Backup.MaiBackupV1)(
          current.backup
        );
        const {
          recordableEvents: ignoredRecordableEventCount,
          recordedEvents: ignoredRecordedEventCount,
          ...legacyCounts
        } = encoded.integrity.counts;
        const {
          recordableEvents: ignoredRecordableEvents,
          recordedEvents: ignoredRecordedEvents,
          ...legacyStores
        } = encoded.stores;
        void ignoredRecordableEventCount;
        void ignoredRecordedEventCount;
        void ignoredRecordableEvents;
        void ignoredRecordedEvents;
        const legacyJson = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown)
        )({
          ...encoded,
          integrity: { counts: legacyCounts },
          source: { ...encoded.source, databaseVersion: 7 },
          stores: legacyStores,
        });

        return yield* backups.importFromJson({
          input: { json: legacyJson },
        });
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.equal(result.backup.source.databaseVersion, 10);
    assert.deepEqual(result.backup.stores.recordableEvents, []);
    assert.deepEqual(result.backup.stores.recordedEvents, []);
    assert.equal(result.backup.integrity.counts.foods, 0);
    assert.equal(result.backup.integrity.counts.recordableEvents, 0);
    assert.equal(result.backup.integrity.counts.recordedEvents, 0);
  });

  it.each([1, 2, 3] as const)(
    "migrates a valid version %s backup through the count gate",
    async (databaseVersion) => {
      const testContext = _makeTestContext();
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const backups = yield* Backup.Backups;
          const json = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Unknown)
          )({
            format: "mai.backup",
            formatVersion: 1,
            integrity: {
              counts: {
                activeMealPlanSelections: 0,
                dailyLogs: 0,
                foods: 0,
                mealEntries: 0,
                plans: 0,
              },
            },
            source: {
              databaseName: "mai",
              databaseVersion,
              exportedAt: 100,
            },
            stores: {
              activeMealPlanSelections: [],
              dailyLogs: [],
              foods: [],
              mealEntries: [],
              plans: [],
            },
          });

          return yield* backups.importFromJson({ input: { json } });
        }).pipe(Effect.provide(testContext.layer))
      );

      assert.equal(result.backup.source.databaseVersion, 10);
      assert.deepEqual(result.backup.stores.recordableEvents, []);
      assert.deepEqual(result.backup.stores.recordedEvents, []);
    }
  );

  it("rejects a version 7 count mismatch before replacing app data", async () => {
    const testContext = _makeTestContext();
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const backups = yield* Backup.Backups;
        const current = yield* backups.exportToJson();
        const encoded = yield* Schema.encodeEffect(Backup.MaiBackupV1)(
          current.backup
        );
        const {
          recordableEvents: ignoredRecordableEventCount,
          recordedEvents: ignoredRecordedEventCount,
          ...legacyCounts
        } = encoded.integrity.counts;
        const {
          recordableEvents: ignoredRecordableEvents,
          recordedEvents: ignoredRecordedEvents,
          ...legacyStores
        } = encoded.stores;
        void ignoredRecordableEventCount;
        void ignoredRecordedEventCount;
        void ignoredRecordableEvents;
        void ignoredRecordedEvents;
        const legacyJson = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown)
        )({
          ...encoded,
          integrity: {
            counts: {
              ...legacyCounts,
              foods: legacyCounts.foods + 1,
            },
          },
          source: { ...encoded.source, databaseVersion: 7 },
          stores: legacyStores,
        });

        return yield* backups
          .importFromJson({ input: { json: legacyJson } })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.instanceOf(failure, Backup.BackupIntegrityError);
    assert.equal(failure.reason, "count-mismatch");
    assert.equal(testContext.readReplaceStoresCalls(), 0);
    assert.deepEqual(testContext.readStores(), emptyStores);
  });

  it("requires event stores and counts in version 9", async () => {
    const rawBackup = _encodedBackup();
    const {
      recordableEvents: ignoredRecordableEventCount,
      recordedEvents: ignoredRecordedEventCount,
      ...countsWithoutEvents
    } = rawBackup.integrity.counts;
    const {
      recordableEvents: ignoredRecordableEvents,
      recordedEvents: ignoredRecordedEvents,
      ...storesWithoutEvents
    } = rawBackup.stores;
    void ignoredRecordableEventCount;
    void ignoredRecordedEventCount;
    void ignoredRecordableEvents;
    void ignoredRecordedEvents;
    const failures = await Effect.runPromise(
      Effect.forEach(
        [
          {
            ...rawBackup,
            integrity: { counts: countsWithoutEvents },
          },
          {
            ...rawBackup,
            stores: storesWithoutEvents,
          },
        ],
        (invalidBackup) =>
          Schema.decodeUnknownEffect(Backup.MaiBackupV1)(invalidBackup).pipe(
            Effect.flip
          )
      )
    );

    assert.isTrue(failures.every(Schema.isSchemaError));
  });

  it.each([
    {
      name: "event count mismatches",
      rawBackup: _encodedBackup({
        recordableEventCount: 0,
        recordableEvents: [_eventFixtures.recordableEvent()],
      }),
      reason: "count-mismatch",
    },
    {
      name: "duplicate daily log dates",
      rawBackup: _encodedBackup({
        storeOverrides: {
          dailyLogs: [
            {
              createdAt: 100,
              dateKey: "2026-07-31",
              planId,
              updatedAt: 100,
            },
            {
              createdAt: 200,
              dateKey: "2026-07-31",
              planId,
              updatedAt: 200,
            },
          ],
          plans: [encodedPlan],
        },
      }),
      reason: "duplicate-daily-log-date",
    },
    {
      name: "duplicate food portion ids",
      rawBackup: _encodedBackup({
        storeOverrides: {
          foods: [
            _encodedFood({
              id: firstFoodId,
              name: "First food",
              portions: [
                {
                  id: portionId,
                  name: "First portion",
                  position: 0,
                  size: { amount: 100, unit: "g" },
                },
              ],
            }),
            _encodedFood({
              id: secondFoodId,
              name: "Second food",
              portions: [
                {
                  id: portionId,
                  name: "Second portion",
                  position: 0,
                  size: { amount: 50, unit: "g" },
                },
              ],
            }),
          ],
        },
      }),
      reason: "duplicate-food-portion-id",
    },
    {
      name: "duplicate food price ids",
      rawBackup: _encodedBackup({
        storeOverrides: {
          foods: [
            _encodedFood({
              id: firstFoodId,
              name: "First food",
              prices: [
                {
                  createdAt: 100,
                  currency: "EUR",
                  id: priceId,
                  isCurrent: true,
                  priceMinor: 100,
                  referenceQuantity: { amount: 100, unit: "g" },
                  updatedAt: 100,
                },
              ],
            }),
            _encodedFood({
              id: secondFoodId,
              name: "Second food",
              prices: [
                {
                  createdAt: 200,
                  currency: "EUR",
                  id: priceId,
                  isCurrent: true,
                  priceMinor: 200,
                  referenceQuantity: { amount: 100, unit: "g" },
                  updatedAt: 200,
                },
              ],
            }),
          ],
        },
      }),
      reason: "duplicate-food-price-id",
    },
    {
      name: "duplicate recordable event ids",
      rawBackup: _encodedBackup({
        recordableEvents: [
          _eventFixtures.recordableEvent(),
          _eventFixtures.recordableEvent({
            id: recordableEventId,
            name: "Walk",
            position: 1,
          }),
        ],
      }),
      reason: "duplicate-recordable-event-id",
    },
    {
      name: "case-insensitive duplicate recordable event names",
      rawBackup: _encodedBackup({
        recordableEvents: [
          _eventFixtures.recordableEvent({ name: "Été" }),
          _eventFixtures.recordableEvent({
            id: secondRecordableEventId,
            name: "E\u0301TE\u0301",
            position: 1,
          }),
        ],
      }),
      reason: "duplicate-recordable-event-name",
    },
    {
      name: "duplicate recorded event ids",
      rawBackup: _encodedBackup({
        recordableEvents: [_eventFixtures.recordableEvent()],
        recordedEvents: [
          _eventFixtures.recordedEvent(),
          _eventFixtures.recordedEvent({ id: recordedEventId }),
        ],
      }),
      reason: "duplicate-recorded-event-id",
    },
    {
      name: "recorded events with a missing definition",
      rawBackup: _encodedBackup({
        recordedEvents: [
          _eventFixtures.recordedEvent({
            id: secondRecordedEventId,
            referencedRecordableEventId: secondRecordableEventId,
          }),
        ],
      }),
      reason: "recorded-event-recordable-event-missing",
    },
  ] as const)("rejects $name", async ({ rawBackup, reason }) => {
    const backup = await Effect.runPromise(
      Schema.decodeEffect(Backup.MaiBackupV1)(rawBackup)
    );
    const failure = await Effect.runPromise(
      Backup.validateBackup({ backup }).pipe(Effect.flip)
    );

    assert.instanceOf(failure, Backup.BackupIntegrityError);
    assert.equal(failure.reason, reason);
  });

  it("validates a large event history without quadratic duplicate scans", async () => {
    const recordedEvents = Array.from({ length: 5_000 }, (_, index) =>
      _eventFixtures.recordedEvent({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      })
    );
    const backup = await Effect.runPromise(
      Schema.decodeEffect(Backup.MaiBackupV1)(
        _encodedBackup({
          recordableEvents: [_eventFixtures.recordableEvent()],
          recordedEvents,
        })
      )
    );

    await Effect.runPromise(Backup.validateBackup({ backup }));

    assert.equal(backup.integrity.counts.recordedEvents, 5_000);
  });

  it("rejects a missing event definition before replacing app data", async () => {
    const testContext = _makeTestContext();
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const backups = yield* Backup.Backups;
        const json = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown)
        )(
          _encodedBackup({
            recordedEvents: [
              _eventFixtures.recordedEvent({
                referencedRecordableEventId: secondRecordableEventId,
              }),
            ],
          })
        );

        return yield* backups
          .importFromJson({ input: { json } })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(testContext.layer))
    );

    assert.instanceOf(failure, Backup.BackupIntegrityError);
    assert.equal(failure.reason, "recorded-event-recordable-event-missing");
    assert.equal(testContext.readReplaceStoresCalls(), 0);
    assert.deepEqual(testContext.readStores(), emptyStores);
  });
});
