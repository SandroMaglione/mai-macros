import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Backup, Domain, Store } from "@mai/nutrition";
import { Effect, Exit, Layer, Schema } from "effect";
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
const customRules: Domain.PlanTargetRules = {
  ...Domain.DefaultPlanTargetRules,
  energyKcal: "maximum",
  proteinGrams: "maximum",
  carbsGrams: "minimum",
  fiberGrams: "maximum",
  sugarGrams: "minimum",
};

it("upgrades a released database, round-trips custom rules, imports v12, rejects invalid rules, and reopens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mai-plan-targets-"));
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
  const layer = Backup.Backups.layer.pipe(Layer.provideMerge(appData));
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
        const backups = yield* Backup.Backups;
        const before = yield* store.readStores;
        const plan = before.plans[0];
        assert.isDefined(plan);
        if (plan === undefined) return;
        assert.deepEqual(plan.targetRules, Domain.DefaultPlanTargetRules);
        assert.equal(plan.fiberTargetGrams, 30);
        assert.equal(before.dailyLogs[0]?.waterServings, 3);
        const encoded = yield* Schema.encodeEffect(Domain.Plan)(plan);
        yield* store.insertPlan(
          yield* Schema.decodeEffect(Domain.Plan)({
            ...encoded,
            targetRules: customRules,
          })
        );
        const exported = yield* backups.exportToJson();
        const encodedBackup = yield* Schema.encodeEffect(Backup.MaiBackupV1)(
          exported.backup
        );
        const legacy = {
          ...encodedBackup,
          source: { ...encodedBackup.source, databaseVersion: 12 },
          stores: {
            ...encodedBackup.stores,
            plans: encodedBackup.stores.plans.map(
              ({ targetRules, ...plan }) => {
                void targetRules;
                return plan;
              }
            ),
          },
        };
        yield* backups.importFromJson({
          input: {
            json: yield* Schema.encodeEffect(
              Schema.fromJsonString(Schema.Unknown)
            )(legacy),
          },
        });
        assert.deepEqual(
          (yield* store.readStores).plans[0]?.targetRules,
          Domain.DefaultPlanTargetRules
        );
        yield* backups.importFromJson({ input: { json: exported.json } });
        assert.deepEqual(
          (yield* store.readStores).plans[0]?.targetRules,
          customRules
        );
        const invalid = {
          ...encodedBackup,
          stores: {
            ...encodedBackup.stores,
            plans: [
              {
                ...encoded,
                targetRules: { ...customRules, fiberGrams: "invalid" },
              },
            ],
          },
        };
        const failure = yield* Effect.exit(
          backups.importFromJson({
            input: {
              json: yield* Schema.encodeEffect(
                Schema.fromJsonString(Schema.Unknown)
              )(invalid),
            },
          })
        );
        assert.isTrue(Exit.isFailure(failure));
        assert.deepEqual(
          (yield* store.readStores).plans[0]?.targetRules,
          customRules
        );
        assert.equal((yield* store.readStores).dailyLogs[0]?.waterServings, 3);
        const sql = yield* SqlClient.SqlClient;
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              sql`UPDATE plans SET fiber_target_rule = 'invalid' WHERE id = ${planId}`
            )
          )
        );
      }).pipe(Effect.provide(layer));

      yield* Effect.gen(function* () {
        const store = yield* Store.NutritionStore;
        const reopened = yield* store.readStores;
        assert.deepEqual(reopened.plans[0]?.targetRules, customRules);
        assert.equal(reopened.plans[0]?.meals[0]?.id, "lunch");
        assert.equal(reopened.dailyLogs[0]?.waterServings, 3);
      }).pipe(Effect.provide(appData));
    }).pipe(
      Effect.ensuring(
        Effect.promise(() => rm(directory, { recursive: true, force: true }))
      )
    )
  );
});
