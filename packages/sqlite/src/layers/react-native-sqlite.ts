import * as SqliteClient from "@effect/sql-sqlite-react-native/SqliteClient";
import { Layer } from "effect";

import { SqliteLocalDataLayer } from "./sqlite-local-data.ts";
import { runSqliteMigrations } from "../migrations/index.ts";
import { SqliteAppDataStoreLayer } from "./sqlite-app-data-store.ts";
import { SqliteEventTrackingStoreLayer } from "./sqlite-event-tracking-store.ts";
import { SqliteNutritionStoreLayer } from "./sqlite-nutrition-store.ts";

export const ReactNativeSqliteLayer = (config: {
  readonly encryptionKey?: string | undefined;
  readonly filename: string;
  readonly location?: string | undefined;
}) =>
  Layer.mergeAll(
    SqliteAppDataStoreLayer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(SqliteNutritionStoreLayer, SqliteEventTrackingStoreLayer)
      )
    ),
    SqliteLocalDataLayer
  ).pipe(
    Layer.provideMerge(
      Layer.effectDiscard(runSqliteMigrations).pipe(
        Layer.provideMerge(SqliteClient.layer(config))
      )
    )
  );
