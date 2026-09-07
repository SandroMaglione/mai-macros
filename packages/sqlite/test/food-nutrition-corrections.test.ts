import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Backup, Domain, Foods, Reporting, Store, Utils } from "@mai/nutrition";
import { Crypto, Effect, Exit, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { assert, it } from "vitest";
import migration001 from "../src/migrations/001-initial.ts";
import migration002 from "../src/migrations/002-custom-plan-meals.ts";
import migration003 from "../src/migrations/003-body-weight-entries.ts";
import migration004 from "../src/migrations/004-food-measurements.ts";
import migration005 from "../src/migrations/005-food-prices.ts";
import migration006 from "../src/migrations/006-event-tracking.ts";
import migration007 from "../src/migrations/007-fasting-days.ts";
import migration008 from "../src/migrations/008-not-recorded-days.ts";
import migration009 from "../src/migrations/009-daily-water.ts";
import migration010 from "../src/migrations/010-one-off-meal-entries.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import { SqliteAppDataStoreLayer } from "../src/layers/sqlite-app-data-store.ts";
import { SqliteNutritionStoreLayer } from "../src/layers/sqlite-nutrition-store.ts";
import { SqliteEventTrackingStoreLayer } from "../src/layers/sqlite-event-tracking-store.ts";

const planId = "11111111-1111-4111-8111-111111111111";
const oliveOilId = "2d36c622-32a2-4378-9c6a-1b3b586ad2e9";

it("migrates catalog corrections safely, recalculates history, resets, restores backups and reopens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mai-food-corrections-"));
  const filename = join(directory, "mai.sqlite");
  const sqlite = SqliteClient.layer({ filename });
  const appData = SqliteAppDataStoreLayer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(SqliteNutritionStoreLayer, SqliteEventTrackingStoreLayer)
    ),
    Layer.provideMerge(
      Layer.effectDiscard(runSqliteMigrations).pipe(Layer.provideMerge(sqlite))
    )
  );
  const layer = Layer.mergeAll(Backup.Backups.layer, Foods.Foods.layer).pipe(
    Layer.provideMerge(appData),
    Layer.provide(
      Layer.succeed(Crypto.Crypto)(
        Crypto.make({
          digest: (_, data) => Effect.succeed(data),
          randomBytes: (size) => new Uint8Array(size).fill(1),
        })
      )
    )
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* migration001;
        yield* migration002;
        yield* migration003;
        yield* migration004;
        yield* migration005;
        yield* migration006;
        yield* migration007;
        yield* migration008;
        yield* migration009;
        yield* migration010;
        yield* sql`CREATE TABLE mai_migrations (migration_id INTEGER PRIMARY KEY, name TEXT NOT NULL)`;
        yield* sql`INSERT INTO mai_migrations (migration_id, name) VALUES (10, 'one-off-meal-entries')`;
        yield* sql`INSERT INTO plans ${sql.insert({ id: planId, name: "Existing plan", protein_target_grams: 100, carbs_target_grams: 200, fat_target_grams: 60, fiber_target_grams: 30, saturated_fat_target_grams: 20, created_at: 101 })}`;
        yield* sql`INSERT INTO plan_meals ${sql.insert({ id: "lunch", plan_id: planId, name: "Lunch", position: 0, created_at: 102 })}`;
        yield* sql`INSERT INTO daily_logs ${sql.insert({ date_key: "2026-09-06", plan_id: planId, mode: "eating", created_at: 103, updated_at: 104, water_servings: 3 })}`;
      }).pipe(Effect.provide(sqlite));

      yield* Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const foods = yield* Foods.Foods;
        const backups = yield* Backup.Backups;
        const original = yield* foods.get({ input: { foodId: oliveOilId } });
        assert.deepEqual(original.nutritionCorrections, {});
        assert.isUndefined(original.fiberGrams);
        assert.isUndefined(original.sugarGrams);
        const entry = yield* Schema.decodeEffect(Domain.CatalogMealEntry)({
          id: "22222222-2222-4222-8222-222222222222",
          dateKey: "2026-09-06",
          mealId: "lunch",
          foodId: oliveOilId,
          quantity: { _tag: "MeasuredFoodQuantity", amount: 10, unit: "g" },
          nutritionMultiplier: 0.1,
          quantityAccuracy: "measured",
          createdAt: 104,
          updatedAt: 105,
        });
        yield* store.insertMealEntry(entry);
        assert.deepEqual(
          Reporting.resolveMealEntryNutrients({
            food: original,
            mealEntry: entry,
          }).fiberGrams,
          { _tag: "Unknown" }
        );
        const sql = yield* SqlClient.SqlClient;
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              sql`UPDATE foods SET fiber_grams_override = -1 WHERE id = ${oliveOilId}`
            )
          )
        );
        const allCorrections = {
          energyKcal: 950,
          proteinGrams: 1,
          carbsGrams: 2,
          fatGrams: 99,
          fiberGrams: 0,
          sugarGrams: 0,
          saturatedFatGrams: 12,
          saltGrams: 0,
        };
        yield* foods.setNutritionCorrections({
          input: { foodId: oliveOilId, corrections: allCorrections },
        });
        assert.deepEqual(
          Utils.foodNutrition(
            yield* foods.get({ input: { foodId: oliveOilId } })
          ),
          allCorrections
        );
        yield* foods.setNutritionCorrections({
          input: { foodId: oliveOilId, corrections: {} },
        });
        const oldBackup = yield* backups.exportToJson();
        const corrected = yield* foods.setNutritionCorrections({
          input: {
            foodId: oliveOilId,
            corrections: { fiberGrams: 0, sugarGrams: 0, energyKcal: 900 },
          },
        });
        assert.equal(corrected.id, original.id);
        assert.equal(corrected.origin, "app-default");
        assert.equal(corrected.energyKcal, original.energyKcal);
        assert.isUndefined(corrected.fiberGrams);
        assert.deepEqual(
          Reporting.resolveMealEntryNutrients({
            food: corrected,
            mealEntry: entry,
          }).fiberGrams,
          { _tag: "Recorded", value: 0 }
        );
        assert.deepEqual(
          Reporting.resolveMealEntryNutrients({
            food: corrected,
            mealEntry: entry,
          }).sugarGrams,
          { _tag: "Recorded", value: 0 }
        );
        assert.equal(
          Utils.calculateEntryNutrients({
            food: corrected,
            nutritionMultiplier: entry.nutritionMultiplier,
          }).energyKcal,
          90
        );
        assert.deepEqual(yield* store.findMealEntriesByFood(original.id), [
          entry,
        ]);
        const futureEntry = yield* Schema.decodeEffect(Domain.CatalogMealEntry)(
          {
            ...(yield* Schema.encodeEffect(Domain.CatalogMealEntry)(entry)),
            id: "33333333-3333-4333-8333-333333333333",
            quantity: { _tag: "MeasuredFoodQuantity", amount: 20, unit: "g" },
            nutritionMultiplier: 0.2,
          }
        );
        yield* store.insertMealEntry(futureEntry);
        const loaded = yield* foods.get({ input: { foodId: oliveOilId } });
        assert.equal(
          Utils.calculateEntryNutrients({
            food: loaded,
            nutritionMultiplier: futureEntry.nutritionMultiplier,
          }).energyKcal,
          180
        );
        const reset = yield* foods.setNutritionCorrections({
          input: { foodId: oliveOilId, corrections: {} },
        });
        assert.deepEqual(
          Utils.foodNutrition(reset),
          Utils.foodNutrition(original)
        );
        assert.deepEqual(
          Reporting.resolveMealEntryNutrients({ food: reset, mealEntry: entry })
            .fiberGrams,
          { _tag: "Unknown" }
        );
        yield* foods.setNutritionCorrections({
          input: {
            foodId: oliveOilId,
            corrections: corrected.nutritionCorrections,
          },
        });
        const exported = yield* backups.exportToJson();
        const legacy = yield* Schema.encodeEffect(Backup.MaiBackupV1)(
          oldBackup.backup
        );
        yield* backups.importFromJson({
          input: {
            json: yield* Schema.encodeEffect(
              Schema.fromJsonString(Schema.Unknown)
            )({
              ...legacy,
              source: { ...legacy.source, databaseVersion: 12 },
              stores: {
                ...legacy.stores,
                foods: legacy.stores.foods.map(
                  ({ nutritionCorrections, ...food }) => {
                    void nutritionCorrections;
                    return food;
                  }
                ),
              },
            }),
          },
        });
        assert.deepEqual(
          (yield* foods.get({ input: { foodId: oliveOilId } }))
            .nutritionCorrections,
          {}
        );
        yield* backups.importFromJson({ input: { json: exported.json } });
        const beforeInvalid = yield* store.readStores;
        for (const corrections of [
          { fiberGrams: -1 },
          { sugarGrams: null },
          { energyKcal: "bad" },
        ]) {
          const encoded = yield* Schema.encodeEffect(Backup.MaiBackupV1)(
            exported.backup
          );
          const invalid = {
            ...encoded,
            stores: {
              ...encoded.stores,
              foods: encoded.stores.foods.map((food) =>
                food.id === oliveOilId
                  ? { ...food, nutritionCorrections: corrections }
                  : food
              ),
            },
          };
          assert.isTrue(
            Exit.isFailure(
              yield* Effect.exit(
                backups.importFromJson({
                  input: {
                    json: yield* Schema.encodeEffect(
                      Schema.fromJsonString(Schema.Unknown)
                    )(invalid),
                  },
                })
              )
            )
          );
          assert.deepEqual(yield* store.readStores, beforeInvalid);
        }
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              foods.setNutritionCorrections({
                input: { foodId: oliveOilId, corrections: { fiberGrams: -1 } },
              })
            )
          )
        );
        const custom = yield* Schema.decodeEffect(Domain.Food)({
          ...(yield* Schema.encodeEffect(Domain.Food)(original)),
          id: "44444444-4444-4444-8444-444444444444",
          origin: "user",
        });
        yield* store.insertFood(custom);
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              foods.setNutritionCorrections({
                input: { foodId: custom.id, corrections: { fiberGrams: 0 } },
              })
            )
          )
        );
        const withConversion = yield* foods.setFoodMassVolumeConversion({
          input: {
            foodId: oliveOilId,
            massVolumeConversion: {
              mass: { amount: "1", unit: "kg" },
              volume: { amount: "1.1", unit: "l" },
            },
          },
        });
        assert.deepEqual(
          withConversion.food.nutritionCorrections,
          corrected.nutritionCorrections
        );
      }).pipe(Effect.provide(layer));
      yield* Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const food = (yield* store.findFoodById(
          yield* Schema.decodeEffect(Domain.FoodId)(oliveOilId)
        ))[0];
        assert.isDefined(food);
        if (food === undefined) return;
        assert.equal(food.energyKcal, 884);
        assert.isUndefined(food.fiberGrams);
        assert.deepEqual(food.nutritionCorrections, {
          fiberGrams: 0,
          sugarGrams: 0,
          energyKcal: 900,
        });
        assert.equal(food.massVolumeConversion?.mass.amount, 1);
        assert.equal((yield* store.findMealEntriesByFood(food.id)).length, 2);
      }).pipe(Effect.provide(appData));
    }).pipe(
      Effect.ensuring(
        Effect.promise(() => rm(directory, { recursive: true, force: true }))
      )
    )
  );
});
