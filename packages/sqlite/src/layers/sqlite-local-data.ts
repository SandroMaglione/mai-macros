import * as NutritionLocalData from "@mai/nutrition/services/local-data";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runSqliteMigrations } from "../migrations/index.ts";

export const makeSqliteLocalData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const reset = Effect.gen(function* () {
    yield* sql`PRAGMA foreign_keys = OFF`;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`DROP TABLE IF EXISTS recorded_events`;
        yield* sql`DROP TABLE IF EXISTS recordable_events`;
        yield* sql`DROP TABLE IF EXISTS meal_entries`;
        yield* sql`DROP TABLE IF EXISTS body_weight_entries`;
        yield* sql`DROP TABLE IF EXISTS active_meal_plan_selections`;
        yield* sql`DROP TABLE IF EXISTS daily_logs`;
        yield* sql`DROP TABLE IF EXISTS plan_meals`;
        yield* sql`DROP TABLE IF EXISTS food_prices`;
        yield* sql`DROP TABLE IF EXISTS food_portions`;
        yield* sql`DROP TABLE IF EXISTS foods`;
        yield* sql`DROP TABLE IF EXISTS plans`;
        yield* sql`DROP TABLE IF EXISTS mai_migrations`;
        yield* runSqliteMigrations.pipe(
          Effect.provideService(SqlClient.SqlClient, sql)
        );
      })
    );
  }).pipe(Effect.ensuring(sql`PRAGMA foreign_keys = ON`.pipe(Effect.orDie)));

  return NutritionLocalData.LocalData.of({
    reset: Effect.mapError(
      reset,
      (cause) =>
        new NutritionLocalData.LocalDataResetError({
          cause,
        })
    ),
  });
});

export const SqliteLocalDataLayer = Layer.effect(
  NutritionLocalData.LocalData,
  makeSqliteLocalData
);
