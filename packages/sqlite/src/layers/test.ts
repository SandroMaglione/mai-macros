import { SqliteClient } from "@effect/sql-sqlite-node";
import { Layer } from "effect";

import { runSqliteMigrations } from "../migrations/index.ts";
import { SqliteNutritionStoreLayer } from "../store.ts";

export const TestSqliteClientLayer = SqliteClient.layer({
  disableWAL: true,
  filename: ":memory:",
});

export const TestSqliteNutritionStoreLayer = SqliteNutritionStoreLayer.pipe(
  Layer.provideMerge(
    Layer.effectDiscard(runSqliteMigrations).pipe(
      Layer.provideMerge(TestSqliteClientLayer)
    )
  )
);
