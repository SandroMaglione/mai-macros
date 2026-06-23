import { LocalData as NutritionLocalData } from "@mai/nutrition";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runSqliteMigrations } from "../migrations/index.ts";

export const makeSqliteLocalData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return NutritionLocalData.LocalData.of({
    reset: Effect.mapError(
      Effect.gen(function* () {
        yield* sql`PRAGMA foreign_keys = OFF`;
        yield* sql`DROP TABLE IF EXISTS meal_entries`;
        yield* sql`DROP TABLE IF EXISTS active_meal_plan_selections`;
        yield* sql`DROP TABLE IF EXISTS daily_logs`;
        yield* sql`DROP TABLE IF EXISTS foods`;
        yield* sql`DROP TABLE IF EXISTS plans`;
        yield* sql`DROP TABLE IF EXISTS mai_migrations`;
        yield* sql`PRAGMA foreign_keys = ON`;
        yield* runSqliteMigrations.pipe(
          Effect.provideService(SqlClient.SqlClient, sql)
        );
      }),
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
