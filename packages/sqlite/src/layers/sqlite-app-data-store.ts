import * as EventStore from "@mai/event-tracking/services/store";
import * as AppData from "@mai/nutrition/services/app-data-store";
import * as NutritionStore from "@mai/nutrition/services/store";
import { Array, Data, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const EmptyRequest = Schema.Struct({});

const ForeignKeyViolationRow = Schema.Struct({
  childTable: Schema.String,
  foreignKeyIndex: Schema.Number,
  parentTable: Schema.String,
  rowId: Schema.NullOr(Schema.Number),
});

class _AppDataForeignKeyViolation extends Data.TaggedError(
  "AppDataForeignKeyViolation"
)<{
  readonly violations: readonly (typeof ForeignKeyViolationRow.Type)[];
}> {}

const _mapStoreError = <Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>
) =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new AppData.AppDataStoreError({
          cause,
        })
    )
  );

export const makeSqliteAppDataStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const nutritionStore = yield* NutritionStore.NutritionStore;
  const eventTrackingStore = yield* EventStore.EventTrackingStore;
  const findForeignKeyViolations = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: ForeignKeyViolationRow,
    execute: () =>
      sql`
        SELECT
          "table" AS childTable,
          fkid AS foreignKeyIndex,
          "parent" AS parentTable,
          rowid AS rowId
        FROM pragma_foreign_key_check
        ORDER BY "table", rowid, fkid
      `,
  });

  return AppData.AppDataStore.of({
    readStores: _mapStoreError(
      sql.withTransaction(
        Effect.gen(function* () {
          const nutritionStores = yield* nutritionStore.readStores;
          const eventTrackingStores = yield* eventTrackingStore.readStores;

          return {
            ...nutritionStores,
            ...eventTrackingStores,
          } satisfies AppData.AppDataStores;
        })
      )
    ),

    replaceStores: (stores) =>
      _mapStoreError(
        sql.withTransaction(
          Effect.gen(function* () {
            yield* nutritionStore.replaceStores({
              activeMealPlanSelections: stores.activeMealPlanSelections,
              bodyWeightEntries: stores.bodyWeightEntries,
              dailyLogs: stores.dailyLogs,
              foods: stores.foods,
              mealEntries: stores.mealEntries,
              plans: stores.plans,
            });
            yield* eventTrackingStore.replaceStores({
              recordableEvents: stores.recordableEvents,
              recordedEvents: stores.recordedEvents,
            });
            const foreignKeyViolations = yield* findForeignKeyViolations({});

            if (Array.isReadonlyArrayNonEmpty(foreignKeyViolations)) {
              return yield* new _AppDataForeignKeyViolation({
                violations: foreignKeyViolations,
              });
            }
          })
        )
      ),
  });
});

export const SqliteAppDataStoreLayer = Layer.effect(
  AppData.AppDataStore,
  makeSqliteAppDataStore.pipe(
    Effect.mapError(
      (cause) =>
        new AppData.AppDataStoreError({
          cause,
        })
    )
  )
);
