import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteClient as NodeSqliteClient } from "@effect/sql-sqlite-node";
import {
  Domain as EventDomain,
  Store as EventStore,
} from "@mai/event-tracking";
import { SqliteAppDataStoreLayer } from "../src/layers/sqlite-app-data-store.ts";
import { SqliteNutritionStoreLayer } from "../src/layers/sqlite-nutrition-store.ts";
import { SqliteEventTrackingStoreLayer } from "../src/layers/sqlite-event-tracking-store.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import {
  Backup,
  Domain,
  MealEntries,
  NutritionReports,
  Store,
} from "@mai/nutrition";
import { Crypto, Effect, Exit, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { assert, describe, it } from "vitest";
import { TestSqliteAppDataStoreLayer } from "./sqlite-test-layers.ts";

const planId = "11111111-1111-4111-8111-111111111111";
const mealId = `${planId}:dinner`;
const dateKey = "2026-09-01";
const foodId = "22222222-2222-4222-8222-222222222222";
const details = {
  name: "定食 · Chef’s dinner (half plate)",
  amountDescription: "One plate, left some rice",
  note: 'Kyoto — "menu calories"; protein estimated. Chef\'s special.\nLeft some rice (about 1/3).',
  nutrients: {
    energyKcal: { _tag: "Recorded", value: 700 },
    proteinGrams: { _tag: "Estimated", value: 30 },
    carbsGrams: { _tag: "Unknown" },
    fatGrams: { _tag: "Unknown" },
    fiberGrams: { _tag: "Unknown" },
    sugarGrams: { _tag: "Unknown" },
    saturatedFatGrams: { _tag: "Unknown" },
    saltGrams: { _tag: "Recorded", value: 0 },
  },
} as const;
const cryptoLayer = Layer.effect(Crypto.Crypto)(
  Effect.sync(() => {
    let nextByte = 1;
    return Crypto.make({
      digest: (algorithm, data) =>
        Effect.succeed(algorithm).pipe(Effect.as(data)),
      randomBytes: (size) => {
        const bytes = new Uint8Array(size);
        bytes.fill(nextByte);
        nextByte += 1;
        return bytes;
      },
    });
  })
);
const testLayer = Layer.mergeAll(
  Backup.Backups.layer,
  MealEntries.MealEntries.layer,
  NutritionReports.NutritionReports.layer
).pipe(
  Layer.provideMerge(TestSqliteAppDataStoreLayer),
  Layer.provide(cryptoLayer)
);

const _seed = Effect.gen(function* () {
  const store = yield* Store.NutritionStore;
  yield* store.insertPlan(
    yield* Schema.decodeEffect(Domain.Plan)({
      id: planId,
      name: "Travel",
      proteinTargetGrams: 100,
      carbsTargetGrams: 200,
      fatTargetGrams: 60,
      createdAt: 101,
      meals: [{ id: mealId, name: "Dinner", position: 0, createdAt: 102 }],
    })
  );
  yield* store.upsertDailyLog(
    yield* Schema.decodeEffect(Domain.DailyLog)({
      dateKey,
      planId,
      mode: "eating",
      waterServings: 5,
      createdAt: 103,
      updatedAt: 104,
    })
  );
  yield* store.upsertActiveMealPlanSelection(
    yield* Schema.decodeEffect(Domain.ActiveMealPlanSelection)({
      id: "active-meal-plan",
      planId,
      updatedAt: 105,
    })
  );
  yield* store.insertFood(
    yield* Schema.decodeEffect(Domain.Food)({
      id: foodId,
      name: "Home food",
      origin: "user",
      nutritionReference: { amount: 100, unit: "g" },
      energyKcal: 200,
      proteinGrams: 10,
      carbsGrams: 20,
      fatGrams: 5,
      fiberGrams: 2,
      sugarGrams: 0,
      saltGrams: 0,
      saturatedFatGrams: 1,
      createdAt: 106,
      updatedAt: 107,
    })
  );
  yield* store.upsertBodyWeightEntry(
    yield* Schema.decodeEffect(Domain.BodyWeightEntry)({
      dateKey,
      weightKilograms: 70.25,
      createdAt: 108,
      updatedAt: 109,
    })
  );
  const events = yield* EventStore.EventTrackingStore;
  const recordable = yield* Schema.decodeEffect(EventDomain.RecordableEvent)({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Walking",
    emoji: "🚶",
    position: 0,
    createdAt: 110,
    updatedAt: 111,
  });
  yield* events.insertRecordableEvent(recordable);
  yield* events.insertRecordedEvent(
    yield* Schema.decodeEffect(EventDomain.RecordedEvent)({
      id: "44444444-4444-4444-8444-444444444444",
      recordableEventId: recordable.id,
      dateKey,
      occurredAt: 112,
      createdAt: 113,
      updatedAt: 114,
    })
  );
  const service = yield* MealEntries.MealEntries;
  const catalog = yield* service.create({
    input: {
      dateKey,
      mealId,
      foodId,
      quantity: { _tag: "MeasuredFoodQuantity", amount: "100", unit: "g" },
    },
  });
  return catalog.mealEntry;
});
const _json = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

describe("one-off entries and local backups", () => {
  it("reopens a saved one-off and exports it without changing any local store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mai-one-off-persistence-"));
    const filename = join(directory, "mai.sqlite");
    const fileLayer = Layer.mergeAll(
      Backup.Backups.layer,
      MealEntries.MealEntries.layer
    ).pipe(
      Layer.provideMerge(SqliteAppDataStoreLayer),
      Layer.provideMerge(
        Layer.mergeAll(SqliteNutritionStoreLayer, SqliteEventTrackingStoreLayer)
      ),
      Layer.provideMerge(
        Layer.effectDiscard(runSqliteMigrations).pipe(
          Layer.provideMerge(
            NodeSqliteClient.layer({ filename, disableWAL: true })
          )
        )
      ),
      Layer.provide(cryptoLayer)
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const saved = yield* Effect.gen(function* () {
          yield* _seed;
          const service = yield* MealEntries.MealEntries;
          yield* service.createOneOff({
            input: { ...details, dateKey, mealId },
          });
          const backups = yield* Backup.Backups;
          return (yield* backups.exportToJson()).backup;
        }).pipe(Effect.provide(fileLayer));
        const reopened = yield* Effect.gen(function* () {
          const backups = yield* Backup.Backups;
          return (yield* backups.exportToJson()).backup;
        }).pipe(Effect.provide(fileLayer));
        assert.deepEqual(reopened.stores, saved.stores);
      }).pipe(
        Effect.ensuring(
          Effect.tryPromise(() =>
            rm(directory, { force: true, recursive: true })
          ).pipe(Effect.orDie)
        )
      )
    );
  });

  it("saves name-only entries and rejects invalid meal ownership without altering existing entries", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const catalog = yield* _seed;
        const service = yield* MealEntries.MealEntries;
        const unknown = { _tag: "Unknown" } as const;
        const input = {
          ...details,
          dateKey,
          mealId,
          nutrients: {
            energyKcal: unknown,
            proteinGrams: unknown,
            carbsGrams: unknown,
            fatGrams: unknown,
            fiberGrams: unknown,
            sugarGrams: unknown,
            saturatedFatGrams: unknown,
            saltGrams: unknown,
          },
        };
        const oneOff = (yield* service.createOneOff({ input })).mealEntry;
        assert.deepEqual(oneOff.nutrients, input.nutrients);
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              service.createOneOff({
                input: { ...input, mealId: "missing-meal" },
              })
            )
          )
        );
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              service.createOneOff({ input: { ...input, name: "   " } })
            )
          )
        );
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              service.reviseOneOff({
                input: { ...details, mealEntryId: catalog.id },
              })
            )
          )
        );
        assert.equal(
          (yield* service.listForDay({ input: { dateKey } })).length,
          2
        );
      }).pipe(Effect.provide(testLayer))
    );
  });

  it("creates, edits and deletes an isolated occurrence; reports per-nutrient certainty without catalog pollution", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const catalog = yield* _seed;
        const service = yield* MealEntries.MealEntries;
        const store = yield* Store.NutritionStore;
        const reports = yield* NutritionReports.NutritionReports;
        const foodsBefore = yield* store.listFoods;
        const created = (yield* service.createOneOff({
          input: { ...details, dateKey, mealId },
        })).mealEntry;
        const day = (yield* reports.getRange({
          input: { startDateKey: dateKey, endDateKey: dateKey },
        })).days[0];
        assert.isDefined(day);
        assert.equal(day.nutrition.recorded.energyKcal, 900);
        assert.equal(day.nutrition.recorded.proteinGrams, 10);
        assert.equal(day.nutrition.estimated.proteinGrams, 30);
        assert.equal(day.nutrition.missing.carbsGrams, 1);
        assert.equal(day.nutrition.coverage.saltGrams, 2);
        assert.isFalse(day.isInsideExpectedPlanRange);
        assert.equal(day.entries.length, 2);
        assert.deepEqual(yield* store.listFoods, foodsBefore);
        assert.deepEqual(
          (yield* service.listFoodUsage()).map((usage) => usage.foodId),
          [foodId]
        );
        assert.deepEqual(yield* store.findMealEntriesByFood(catalog.foodId), [
          catalog,
        ]);
        const revised = (yield* service.reviseOneOff({
          input: {
            ...details,
            mealEntryId: created.id,
            name: "Revised dinner",
            nutrients: {
              ...details.nutrients,
              carbsGrams: { _tag: "Estimated", value: 80 },
            },
          },
        })).mealEntry;
        assert.equal(
          revised.createdAt.epochMilliseconds,
          created.createdAt.epochMilliseconds
        );
        assert.equal(revised.id, created.id);
        assert.equal(revised.dateKey, dateKey);
        assert.deepEqual(yield* store.findMealEntryById(catalog.id), [catalog]);
        assert.deepEqual(yield* store.findMealEntryById(created.id), [revised]);
        yield* service.delete({ input: { mealEntryId: created.id } });
        assert.deepEqual(yield* service.listForDay({ input: { dateKey } }), [
          catalog,
        ]);
      }).pipe(Effect.provide(testLayer))
    );
  });

  it("round-trips every local store with one-offs, unknowns, explicit zero and estimated catalog quantities", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const catalog = yield* _seed;
        const service = yield* MealEntries.MealEntries;
        const backups = yield* Backup.Backups;
        yield* service.revise({
          input: {
            mealEntryId: catalog.id,
            quantityAccuracy: "estimated",
            quantity: {
              _tag: "MeasuredFoodQuantity",
              amount: "150",
              unit: "g",
            },
          },
        });
        const oneOff = (yield* service.createOneOff({
          input: { ...details, dateKey, mealId },
        })).mealEntry;
        const before = yield* backups.exportToJson();
        yield* service.delete({ input: { mealEntryId: oneOff.id } });
        yield* backups.importFromJson({ input: { json: before.json } });
        const after = yield* backups.exportToJson();
        assert.deepEqual(after.backup.stores, before.backup.stores);
        assert.equal(after.backup.source.databaseVersion, 13);
        const restored = after.backup.stores.mealEntries.find(
          Domain.isOneOffMealEntry
        );
        assert.deepEqual(restored?.nutrients.saltGrams, {
          _tag: "Recorded",
          value: 0,
        });
        assert.deepEqual(restored?.nutrients.carbsGrams, { _tag: "Unknown" });
        assert.equal(restored?.note, details.note);
        assert.equal(
          after.backup.stores.mealEntries.find(Domain.isCatalogMealEntry)
            ?.quantityAccuracy,
          "estimated"
        );
      }).pipe(Effect.provide(testLayer))
    );
  });

  it.each([8, 9, 10, 11])(
    "imports released version %s without upgrading unspecified accuracy to measured",
    async (databaseVersion) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* _seed;
          const backups = yield* Backup.Backups;
          const before = (yield* backups.exportToJson()).backup;
          const encoded = yield* Schema.encodeEffect(Backup.MaiBackupV1)(
            before
          );
          const legacy = {
            ...encoded,
            source: { ...encoded.source, databaseVersion },
            stores: {
              ...encoded.stores,
              mealEntries: encoded.stores.mealEntries
                .filter((entry) => entry.kind === "catalog")
                .map((entry) =>
                  Object.fromEntries(
                    Object.entries(entry).filter(
                      ([key]) => key !== "kind" && key !== "quantityAccuracy"
                    )
                  )
                ),
            },
          };
          yield* backups.importFromJson({
            input: { json: yield* _json(legacy) },
          });
          assert.deepEqual(
            (yield* backups.exportToJson()).backup.stores,
            before.stores
          );
        }).pipe(Effect.provide(testLayer))
      );
    }
  );

  it("rejects malformed, future and inconsistent backups before replacing any data", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* _seed;
        const service = yield* MealEntries.MealEntries;
        const backups = yield* Backup.Backups;
        yield* service.createOneOff({ input: { ...details, dateKey, mealId } });
        const before = (yield* backups.exportToJson()).backup;
        const encoded = yield* Schema.encodeEffect(Backup.MaiBackupV1)(before);
        const badValues = [
          { _tag: "Estimated", value: -1 },
          { _tag: "Invalid", value: 10 },
        ];
        const invalidBackups = [
          {
            ...encoded,
            stores: {
              ...encoded.stores,
              mealEntries: encoded.stores.mealEntries.map((entry) =>
                entry.kind === "one-off"
                  ? { ...entry, dateKey: "2026-09-02" }
                  : entry
              ),
            },
          },
          { ...encoded, source: { ...encoded.source, databaseVersion: 14 } },
          {
            ...encoded,
            integrity: {
              counts: { ...encoded.integrity.counts, mealEntries: 999 },
            },
          },
          ...badValues.map((value) => ({
            ...encoded,
            stores: {
              ...encoded.stores,
              mealEntries: encoded.stores.mealEntries.map((entry) =>
                entry.kind === "one-off"
                  ? {
                      ...entry,
                      nutrients: { ...entry.nutrients, proteinGrams: value },
                    }
                  : entry
              ),
            },
          })),
          {
            ...encoded,
            stores: {
              ...encoded.stores,
              mealEntries: encoded.stores.mealEntries.map((entry) => ({
                ...entry,
                mealId: "missing",
              })),
            },
          },
        ];
        for (const invalid of invalidBackups) {
          const result = yield* Effect.exit(
            backups.importFromJson({ input: { json: yield* _json(invalid) } })
          );
          assert.isTrue(Exit.isFailure(result));
          assert.deepEqual(
            (yield* backups.exportToJson()).backup.stores,
            before.stores
          );
        }
      }).pipe(Effect.provide(testLayer))
    );
  });

  it("rolls back the entire restore when a one-off write fails after existing data has been removed", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* _seed;
        const service = yield* MealEntries.MealEntries;
        const backups = yield* Backup.Backups;
        const sql = yield* SqlClient.SqlClient;
        const oneOff = (yield* service.createOneOff({
          input: { ...details, dateKey, mealId },
        })).mealEntry;
        const source = yield* backups.exportToJson();
        yield* service.delete({ input: { mealEntryId: oneOff.id } });
        const before = (yield* backups.exportToJson()).backup;
        yield* sql`CREATE TRIGGER fail_one_off BEFORE INSERT ON meal_entries WHEN NEW.kind = 'one-off' BEGIN SELECT RAISE(ABORT, 'forced restore failure'); END`;
        const failed = yield* Effect.exit(
          backups.importFromJson({ input: { json: source.json } })
        );
        assert.isTrue(Exit.isFailure(failed));
        assert.deepEqual(
          (yield* backups.exportToJson()).backup.stores,
          before.stores
        );
        yield* sql`DROP TRIGGER fail_one_off`;
        yield* backups.importFromJson({ input: { json: source.json } });
        assert.deepEqual(
          (yield* backups.exportToJson()).backup.stores,
          source.backup.stores
        );
      }).pipe(Effect.provide(testLayer))
    );
  });
});
