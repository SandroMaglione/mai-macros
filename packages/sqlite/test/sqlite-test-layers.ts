import { SqliteClient } from "@effect/sql-sqlite-node";
import { Layer } from "effect";

import { SqliteLocalDataLayer } from "../src/layers/sqlite-local-data.ts";
import { runSqliteMigrations } from "../src/migrations/index.ts";
import { SqliteAppDataStoreLayer } from "../src/layers/sqlite-app-data-store.ts";
import { SqliteEventTrackingStoreLayer } from "../src/layers/sqlite-event-tracking-store.ts";
import { SqliteNutritionStoreLayer } from "../src/layers/sqlite-nutrition-store.ts";

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

export const TestSqliteEventTrackingStoreLayer =
  SqliteEventTrackingStoreLayer.pipe(
    Layer.provideMerge(
      Layer.effectDiscard(runSqliteMigrations).pipe(
        Layer.provideMerge(TestSqliteClientLayer)
      )
    )
  );

export const TestSqliteAppDataStoreLayer = SqliteAppDataStoreLayer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(SqliteNutritionStoreLayer, SqliteEventTrackingStoreLayer)
  ),
  Layer.provideMerge(
    Layer.effectDiscard(runSqliteMigrations).pipe(
      Layer.provideMerge(TestSqliteClientLayer)
    )
  )
);

export const TestSqliteLocalDataLayer = SqliteLocalDataLayer.pipe(
  Layer.provideMerge(
    Layer.effectDiscard(runSqliteMigrations).pipe(
      Layer.provideMerge(TestSqliteClientLayer)
    )
  )
);

export const TestSqliteDataLayer = Layer.mergeAll(
  SqliteAppDataStoreLayer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(SqliteNutritionStoreLayer, SqliteEventTrackingStoreLayer)
    )
  ),
  SqliteLocalDataLayer
).pipe(
  Layer.provideMerge(
    Layer.effectDiscard(runSqliteMigrations).pipe(
      Layer.provideMerge(TestSqliteClientLayer)
    )
  )
);
